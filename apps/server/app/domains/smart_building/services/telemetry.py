"""Telemetry ingestion, aggregation queries and insights.

Split out of the former single-file ``service.py``; the method bodies are
unchanged. Every module is a mixin combined by ``SmartBuildingService``,
so cross-module ``self`` calls keep working exactly as before.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func

from app.core.config import settings
from app.domains.smart_building.schemas import DeviceStateUpdate
from app.domains.smart_building.services.constants import (
    CAPABILITY_METRIC_PREFIX,
    CAPABILITY_METRIC_TYPES,
    SUPPORTED_TELEMETRY_METRICS,
    TELEMETRY_METRIC_UNITS,
    TELEMETRY_INTERVAL_SECONDS,
    TELEMETRY_INSIGHT_TYPES,
)
from app.models.unit import Unit
from app.models.smart_building import (
    Device,
    DeviceTelemetry,
    TelemetryInsight,
)


class TelemetryMixin:
    """Telemetry ingestion, aggregation queries and insights."""

    def get_device_telemetry(
        self,
        *,
        device_id: int,
        metric_type: str | None,
        from_ts: datetime | None,
        to_ts: datetime | None,
        interval: str | None,
    ) -> dict[str, object]:
        self.get_device_or_404(device_id)
        payload = self._telemetry_query(
            metric_type=metric_type,
            from_ts=from_ts,
            to_ts=to_ts,
            interval=interval,
            scope_filters=(DeviceTelemetry.device_id == device_id,),
        )
        return {
            "scope_type": "device",
            "scope_id": device_id,
            **payload,
        }

    def get_unit_telemetry(
        self,
        *,
        unit_id: int,
        metric_type: str | None,
        from_ts: datetime | None,
        to_ts: datetime | None,
        interval: str | None,
    ) -> dict[str, object]:
        self._ensure_unit_visible(unit_id)
        payload = self._telemetry_query(
            metric_type=metric_type,
            from_ts=from_ts,
            to_ts=to_ts,
            interval=interval,
            scope_filters=(DeviceTelemetry.unit_id == unit_id,),
        )
        return {
            "scope_type": "unit",
            "scope_id": unit_id,
            **payload,
        }

    def get_property_telemetry(
        self,
        *,
        property_id: int,
        metric_type: str | None,
        from_ts: datetime | None,
        to_ts: datetime | None,
        interval: str | None,
    ) -> dict[str, object]:
        self._property_or_404(property_id)
        payload = self._telemetry_query(
            metric_type=metric_type,
            from_ts=from_ts,
            to_ts=to_ts,
            interval=interval,
            scope_filters=(DeviceTelemetry.property_id == property_id,),
        )
        return {
            "scope_type": "property",
            "scope_id": property_id,
            **payload,
        }

    def _extract_battery_from_raw_payload(self, raw_payload_json: str | None) -> int | None:
        raw = self._safe_json_loads(raw_payload_json)
        candidates = (
            raw.get("battery_level"),
            raw.get("battery"),
            (raw.get("attributes") or {}).get("battery_level") if isinstance(raw.get("attributes"), dict) else None,
            (raw.get("attributes") or {}).get("battery") if isinstance(raw.get("attributes"), dict) else None,
        )
        for value in candidates:
            try:
                if value is None:
                    continue
                parsed = int(value)
                return max(0, min(parsed, 100))
            except (TypeError, ValueError):
                continue
        return None

    def _extract_energy_from_raw_payload(self, raw_payload_json: str | None) -> Decimal | None:
        raw = self._safe_json_loads(raw_payload_json)
        attrs = raw.get("attributes") if isinstance(raw.get("attributes"), dict) else {}
        candidates = (
            raw.get("energy_kwh"),
            raw.get("energy"),
            raw.get("total_energy"),
            attrs.get("energy"),
            attrs.get("total_energy"),
            attrs.get("last_period"),
        )
        for value in candidates:
            parsed = self._to_decimal(value)
            if parsed is not None:
                return parsed
        return None

    def _capability_metric_sample(
        self, device: Device, payload: DeviceStateUpdate
    ) -> tuple[str, Decimal, str | None] | None:
        """Sample declared by a ``metric.*`` capability.

        Plants report readings the generic Home Assistant mapping cannot type —
        filter pressure, pump runtime, daily kWh, soil moisture. The capability
        says what the number means, so the value is read straight from the
        reported state instead of being inferred from a device class.
        """
        capability = (device.capability_key or "").strip()
        if not capability.startswith(CAPABILITY_METRIC_PREFIX):
            return None
        metric_type = CAPABILITY_METRIC_TYPES.get(capability)
        if metric_type is None or metric_type not in SUPPORTED_TELEMETRY_METRICS:
            return None

        raw = self._safe_json_loads(payload.raw_payload_json)
        value = self._to_decimal(raw.get("state"))
        if value is None:
            return None
        attributes = raw.get("attributes") if isinstance(raw.get("attributes"), dict) else {}
        unit_name = str(attributes.get("unit_of_measurement") or "").strip() or None
        return metric_type, value, unit_name or TELEMETRY_METRIC_UNITS.get(metric_type)

    def _prepare_telemetry_samples(
        self,
        *,
        device: Device,
        payload: DeviceStateUpdate,
        recorded_at: datetime,
    ) -> list[dict[str, object]]:
        samples: list[dict[str, object]] = []
        unit = self.db.query(Unit).filter(Unit.id == device.unit_id).first() if device.unit_id else None
        property_id = unit.property_id if unit is not None else None

        metric_values: list[tuple[str, Decimal | None, str | None]] = [
            ("temperature", self._to_decimal(payload.temperature_c), TELEMETRY_METRIC_UNITS["temperature"]),
            ("humidity", self._to_decimal(payload.humidity_pct), TELEMETRY_METRIC_UNITS["humidity"]),
            ("power", self._to_decimal(payload.energy_w), TELEMETRY_METRIC_UNITS["power"]),
            ("signal", self._to_decimal(payload.signal_rssi), TELEMETRY_METRIC_UNITS["signal"]),
            (
                "motion",
                Decimal("1") if payload.motion_detected is True else Decimal("0") if payload.motion_detected is False else None,
                TELEMETRY_METRIC_UNITS["motion"],
            ),
            (
                "contact",
                Decimal("1") if payload.contact_open is True else Decimal("0") if payload.contact_open is False else None,
                TELEMETRY_METRIC_UNITS["contact"],
            ),
        ]

        battery = self._extract_battery_from_raw_payload(payload.raw_payload_json)
        if battery is not None:
            metric_values.append(("battery", Decimal(str(battery)), TELEMETRY_METRIC_UNITS["battery"]))

        energy_total = self._extract_energy_from_raw_payload(payload.raw_payload_json)
        if energy_total is not None:
            metric_values.append(("energy", energy_total, TELEMETRY_METRIC_UNITS["energy"]))

        capability_sample = self._capability_metric_sample(device, payload)
        if capability_sample is not None:
            metric_values.append(capability_sample)

        min_interval = max(0, int(settings.telemetry_min_interval_seconds))
        dedup_cutoff = recorded_at - timedelta(seconds=min_interval)

        for metric_type, value, unit_name in metric_values:
            if value is None:
                continue
            last_sample = (
                self._scoped_query(DeviceTelemetry)
                .filter(
                    DeviceTelemetry.device_id == device.id,
                    DeviceTelemetry.metric_type == metric_type,
                )
                .order_by(DeviceTelemetry.recorded_at.desc(), DeviceTelemetry.id.desc())
                .first()
            )
            if (
                last_sample is not None
                and min_interval > 0
                and last_sample.recorded_at is not None
                and self._as_utc_datetime(last_sample.recorded_at) is not None
            ):
                last_recorded = self._as_utc_datetime(last_sample.recorded_at)
                if (
                    last_recorded is not None
                    and last_recorded >= dedup_cutoff
                    and self._to_decimal(last_sample.value) == value
                ):
                    continue

            samples.append(
                {
                    "tenant_id": self.tenant_id,
                    "property_id": property_id,
                    "unit_id": device.unit_id,
                    "device_id": device.id,
                    "metric_type": metric_type,
                    "value": value,
                    "unit": unit_name,
                    "recorded_at": recorded_at,
                }
            )
        return samples

    def _ingest_telemetry_for_state(
        self,
        *,
        device: Device,
        payload: DeviceStateUpdate,
        recorded_at: datetime,
    ) -> int:
        created = 0
        for sample in self._prepare_telemetry_samples(device=device, payload=payload, recorded_at=recorded_at):
            self.db.add(DeviceTelemetry(**sample))
            self._evaluate_telemetry_sample_insights(
                device=device,
                metric_type=sample["metric_type"],
                value=sample["value"],
                recorded_at=recorded_at,
            )
            created += 1
        return created

    def _insight_status(self, insight: TelemetryInsight) -> str:
        return "resolved" if insight.resolved_at is not None else "open"

    def _insight_to_dict(self, insight: TelemetryInsight) -> dict[str, object]:
        return {
            "id": insight.id,
            "tenant_id": insight.tenant_id,
            "property_id": insight.property_id,
            "unit_id": insight.unit_id,
            "device_id": insight.device_id,
            "metric_type": insight.metric_type,
            "insight_type": insight.insight_type,
            "severity": insight.severity,
            "status": self._insight_status(insight),
            "value": insight.value,
            "threshold": insight.threshold,
            "detected_at": insight.detected_at,
            "resolved_at": insight.resolved_at,
            "metadata_json": insight.metadata_json,
        }

    def _upsert_telemetry_insight(
        self,
        *,
        device: Device,
        metric_type: str,
        insight_type: str,
        severity: str,
        value: Decimal | None,
        threshold: Decimal | None,
        detected_at: datetime,
        metadata: dict | None = None,
    ) -> TelemetryInsight:
        existing_open = (
            self._scoped_query(TelemetryInsight)
            .filter(
                TelemetryInsight.device_id == device.id,
                TelemetryInsight.metric_type == metric_type,
                TelemetryInsight.insight_type == insight_type,
                TelemetryInsight.resolved_at.is_(None),
            )
            .order_by(TelemetryInsight.detected_at.desc(), TelemetryInsight.id.desc())
            .first()
        )
        if existing_open is not None:
            existing_open.severity = severity
            existing_open.value = value
            existing_open.threshold = threshold
            existing_open.metadata_json = self._safe_json_dumps(metadata or {})
            return existing_open

        unit = self.db.query(Unit).filter(Unit.id == device.unit_id).first() if device.unit_id else None
        property_id = unit.property_id if unit is not None else None
        insight = TelemetryInsight(
            tenant_id=self.tenant_id,
            property_id=property_id,
            unit_id=device.unit_id,
            device_id=device.id,
            metric_type=metric_type,
            insight_type=insight_type,
            severity=severity,
            value=value,
            threshold=threshold,
            detected_at=detected_at,
            resolved_at=None,
            metadata_json=self._safe_json_dumps(metadata or {}),
        )
        self.db.add(insight)
        return insight

    def _resolve_telemetry_insight(
        self,
        *,
        device_id: int,
        metric_type: str,
        insight_type: str,
        resolved_at: datetime,
    ) -> int:
        open_rows = (
            self._scoped_query(TelemetryInsight)
            .filter(
                TelemetryInsight.device_id == device_id,
                TelemetryInsight.metric_type == metric_type,
                TelemetryInsight.insight_type == insight_type,
                TelemetryInsight.resolved_at.is_(None),
            )
            .all()
        )
        for row in open_rows:
            row.resolved_at = resolved_at
        return len(open_rows)

    def _evaluate_telemetry_sample_insights(
        self,
        *,
        device: Device,
        metric_type: str,
        value: Decimal,
        recorded_at: datetime,
    ) -> None:
        metric = (metric_type or "").strip().lower()
        if metric not in SUPPORTED_TELEMETRY_METRICS:
            return

        if metric == "temperature":
            high = Decimal(str(settings.telemetry_temperature_high_c))
            low = Decimal(str(settings.telemetry_temperature_low_c))
            if value > high or value < low:
                severity = "critical" if value > (high + Decimal("3")) or value < (low - Decimal("3")) else "warning"
                self._upsert_telemetry_insight(
                    device=device,
                    metric_type="temperature",
                    insight_type="telemetry.temperature_abnormal",
                    severity=severity,
                    value=value,
                    threshold=high if value > high else low,
                    detected_at=recorded_at,
                    metadata={"range_min": str(low), "range_max": str(high)},
                )
            else:
                self._resolve_telemetry_insight(
                    device_id=device.id,
                    metric_type="temperature",
                    insight_type="telemetry.temperature_abnormal",
                    resolved_at=recorded_at,
                )

        if metric == "humidity":
            high = Decimal(str(settings.telemetry_humidity_high_pct))
            if value > high:
                severity = "critical" if value > Decimal("95") else "warning"
                self._upsert_telemetry_insight(
                    device=device,
                    metric_type="humidity",
                    insight_type="telemetry.humidity_abnormal",
                    severity=severity,
                    value=value,
                    threshold=high,
                    detected_at=recorded_at,
                    metadata={"range_max": str(high)},
                )
            else:
                self._resolve_telemetry_insight(
                    device_id=device.id,
                    metric_type="humidity",
                    insight_type="telemetry.humidity_abnormal",
                    resolved_at=recorded_at,
                )

        if metric in {"power", "energy"}:
            lookback_threshold = recorded_at - timedelta(hours=24)
            previous_rows = (
                self._scoped_query(DeviceTelemetry)
                .filter(
                    DeviceTelemetry.device_id == device.id,
                    DeviceTelemetry.metric_type == metric,
                    DeviceTelemetry.recorded_at >= lookback_threshold,
                    DeviceTelemetry.recorded_at < recorded_at,
                )
                .order_by(DeviceTelemetry.recorded_at.desc(), DeviceTelemetry.id.desc())
                .limit(24)
                .all()
            )
            previous_values = [self._to_decimal(row.value) for row in previous_rows]
            previous_values = [v for v in previous_values if v is not None]
            if previous_values:
                rolling_avg = sum(previous_values, Decimal("0")) / Decimal(str(len(previous_values)))
                spike_threshold = rolling_avg * Decimal(str(settings.telemetry_energy_spike_factor))
                if rolling_avg > Decimal("0") and value > spike_threshold:
                    severity = "critical" if value > (rolling_avg * Decimal("2.5")) else "warning"
                    self._upsert_telemetry_insight(
                        device=device,
                        metric_type=metric,
                        insight_type="telemetry.energy_spike",
                        severity=severity,
                        value=value,
                        threshold=spike_threshold,
                        detected_at=recorded_at,
                        metadata={"rolling_avg": str(rolling_avg), "window_samples": len(previous_values)},
                    )
                else:
                    self._resolve_telemetry_insight(
                        device_id=device.id,
                        metric_type=metric,
                        insight_type="telemetry.energy_spike",
                        resolved_at=recorded_at,
                    )

        out_of_range = False
        if metric == "battery" and (value < Decimal("0") or value > Decimal("100")):
            out_of_range = True
        if metric == "humidity" and (value < Decimal("0") or value > Decimal("100")):
            out_of_range = True
        if metric == "temperature" and (value < Decimal("-20") or value > Decimal("60")):
            out_of_range = True
        if out_of_range:
            self._upsert_telemetry_insight(
                device=device,
                metric_type=metric,
                insight_type="telemetry.sensor_value_out_of_range",
                severity="critical",
                value=value,
                threshold=None,
                detected_at=recorded_at,
                metadata={},
            )
        else:
            self._resolve_telemetry_insight(
                device_id=device.id,
                metric_type=metric,
                insight_type="telemetry.sensor_value_out_of_range",
                resolved_at=recorded_at,
            )

    def _ensure_not_reporting_insights(
        self,
        *,
        property_id: int | None = None,
        unit_id: int | None = None,
    ) -> None:
        devices_query = self._scoped_query(Device).filter(Device.is_active.is_(True))
        if unit_id is not None:
            devices_query = devices_query.filter(Device.unit_id == unit_id)
        elif property_id is not None:
            scoped_units = self._property_units(property_id)
            scoped_unit_ids = [row.id for row in scoped_units]
            if scoped_unit_ids:
                devices_query = devices_query.filter(Device.unit_id.in_(scoped_unit_ids))
            else:
                devices_query = devices_query.filter(Device.id == -1)
        devices = devices_query.all()
        if not devices:
            return

        telemetry_latest = (
            self._scoped_query(DeviceTelemetry)
            .with_entities(DeviceTelemetry.device_id, func.max(DeviceTelemetry.recorded_at))
            .group_by(DeviceTelemetry.device_id)
            .all()
        )
        latest_by_device = {int(device_id): self._as_utc_datetime(recorded_at) for device_id, recorded_at in telemetry_latest}
        now = datetime.now(timezone.utc)
        stale_cutoff = now - timedelta(seconds=max(60, int(settings.telemetry_not_reporting_seconds)))
        touched = False
        for device in devices:
            latest = latest_by_device.get(device.id)
            if latest is None or latest < stale_cutoff:
                age_seconds = int((now - latest).total_seconds()) if latest is not None else None
                self._upsert_telemetry_insight(
                    device=device,
                    metric_type="telemetry",
                    insight_type="telemetry.device_not_reporting",
                    severity="critical",
                    value=Decimal(str(age_seconds)) if age_seconds is not None else None,
                    threshold=Decimal(str(settings.telemetry_not_reporting_seconds)),
                    detected_at=now,
                    metadata={"last_telemetry_at": latest.isoformat() if latest else None},
                )
                touched = True
            else:
                resolved = self._resolve_telemetry_insight(
                    device_id=device.id,
                    metric_type="telemetry",
                    insight_type="telemetry.device_not_reporting",
                    resolved_at=now,
                )
                if resolved > 0:
                    touched = True
        if touched:
            self.db.commit()

    def list_telemetry_insights(
        self,
        *,
        metric_type: str | None = None,
        insight_type: str | None = None,
        severity: str | None = None,
        status: str | None = None,
        property_id: int | None = None,
        unit_id: int | None = None,
    ) -> list[dict[str, object]]:
        normalized_metric = (metric_type or "").strip().lower() or None
        normalized_insight = (insight_type or "").strip().lower() or None
        normalized_severity = (severity or "").strip().lower() or None
        normalized_status = (status or "").strip().lower() or None

        if normalized_insight and normalized_insight not in TELEMETRY_INSIGHT_TYPES:
            raise HTTPException(status_code=400, detail="insight_type non valido")
        if normalized_status and normalized_status not in {"open", "resolved"}:
            raise HTTPException(status_code=400, detail="status insight non valido")
        if property_id is not None:
            self._property_or_404(property_id)
        if unit_id is not None:
            self._ensure_unit_visible(unit_id)

        self._ensure_not_reporting_insights(property_id=property_id, unit_id=unit_id)

        query = self._scoped_query(TelemetryInsight)
        if property_id is not None:
            query = query.filter(TelemetryInsight.property_id == property_id)
        if unit_id is not None:
            query = query.filter(TelemetryInsight.unit_id == unit_id)
        if normalized_metric:
            query = query.filter(TelemetryInsight.metric_type == normalized_metric)
        if normalized_insight:
            query = query.filter(TelemetryInsight.insight_type == normalized_insight)
        if normalized_severity:
            query = query.filter(TelemetryInsight.severity == normalized_severity)
        if normalized_status == "open":
            query = query.filter(TelemetryInsight.resolved_at.is_(None))
        if normalized_status == "resolved":
            query = query.filter(TelemetryInsight.resolved_at.is_not(None))

        rows = query.order_by(TelemetryInsight.detected_at.desc(), TelemetryInsight.id.desc()).limit(500).all()
        return [self._insight_to_dict(row) for row in rows]

    def _telemetry_scope_summaries(
        self,
        *,
        property_id: int | None = None,
        unit_id: int | None = None,
    ) -> tuple[dict[str, object], dict[str, object]]:
        query = self._scoped_query(DeviceTelemetry)
        if property_id is not None:
            query = query.filter(DeviceTelemetry.property_id == property_id)
        if unit_id is not None:
            query = query.filter(DeviceTelemetry.unit_id == unit_id)
        since = datetime.now(timezone.utc) - timedelta(hours=24)
        rows = query.filter(DeviceTelemetry.recorded_at >= since).all()

        temperatures = [self._to_decimal(row.value) for row in rows if row.metric_type == "temperature"]
        temperatures = [value for value in temperatures if value is not None]
        humidities = [self._to_decimal(row.value) for row in rows if row.metric_type == "humidity"]
        humidities = [value for value in humidities if value is not None]
        powers = [self._to_decimal(row.value) for row in rows if row.metric_type == "power"]
        powers = [value for value in powers if value is not None]
        energies = [self._to_decimal(row.value) for row in rows if row.metric_type == "energy"]
        energies = [value for value in energies if value is not None]

        environment_summary = {
            "avg_temperature": (sum(temperatures, Decimal("0")) / Decimal(str(len(temperatures)))) if temperatures else None,
            "min_temperature": min(temperatures) if temperatures else None,
            "max_temperature": max(temperatures) if temperatures else None,
            "avg_humidity": (sum(humidities, Decimal("0")) / Decimal(str(len(humidities)))) if humidities else None,
        }
        open_spikes = self.list_telemetry_insights(
            property_id=property_id,
            unit_id=unit_id,
            insight_type="telemetry.energy_spike",
            status="open",
        )
        energy_summary = {
            "total_energy_kwh": sum(energies, Decimal("0")) if energies else None,
            "avg_power_w": (sum(powers, Decimal("0")) / Decimal(str(len(powers)))) if powers else None,
            "energy_spikes": len(open_spikes),
        }
        return environment_summary, energy_summary

    def _parse_telemetry_interval_seconds(self, interval: str | None) -> int | None:
        if interval is None:
            return None
        normalized = interval.strip().lower()
        if not normalized:
            return None
        seconds = TELEMETRY_INTERVAL_SECONDS.get(normalized)
        if seconds is None:
            raise HTTPException(status_code=400, detail="Intervallo telemetria non valido")
        return seconds

    def _bucket_datetime(self, timestamp: datetime, interval_seconds: int) -> datetime:
        ts = self._as_utc_datetime(timestamp) or datetime.now(timezone.utc)
        epoch = int(ts.timestamp())
        bucket_epoch = epoch - (epoch % interval_seconds)
        return datetime.fromtimestamp(bucket_epoch, tz=timezone.utc)

    def _validate_metric_type(self, metric_type: str | None) -> str | None:
        if metric_type is None:
            return None
        normalized = metric_type.strip().lower()
        if not normalized:
            return None
        if normalized not in SUPPORTED_TELEMETRY_METRICS:
            raise HTTPException(status_code=400, detail="metric_type telemetria non valido")
        return normalized

    def _telemetry_query(
        self,
        *,
        metric_type: str | None,
        from_ts: datetime | None,
        to_ts: datetime | None,
        interval: str | None,
        scope_filters: tuple,
    ) -> dict[str, object]:
        normalized_metric = self._validate_metric_type(metric_type)
        interval_seconds = self._parse_telemetry_interval_seconds(interval)
        from_utc = self._as_utc_datetime(from_ts)
        to_utc = self._as_utc_datetime(to_ts)
        if from_utc is not None and to_utc is not None and from_utc > to_utc:
            raise HTTPException(status_code=400, detail="Intervallo temporale non valido")

        query = self._scoped_query(DeviceTelemetry).filter(*scope_filters)
        if normalized_metric is not None:
            query = query.filter(DeviceTelemetry.metric_type == normalized_metric)
        if from_utc is not None:
            query = query.filter(DeviceTelemetry.recorded_at >= from_utc)
        if to_utc is not None:
            query = query.filter(DeviceTelemetry.recorded_at <= to_utc)

        rows = (
            query.order_by(DeviceTelemetry.recorded_at.asc(), DeviceTelemetry.id.asc())
            .limit(5000)
            .all()
        )
        series_map: dict[tuple[str, str | None], dict[datetime, dict[str, object]]] = {}

        for row in rows:
            metric = (row.metric_type or "").strip().lower()
            if not metric:
                continue
            unit_name = row.unit
            key = (metric, unit_name)
            if key not in series_map:
                series_map[key] = {}
            row_time = self._as_utc_datetime(row.recorded_at) or datetime.now(timezone.utc)
            bucket = (
                self._bucket_datetime(row_time, interval_seconds)
                if interval_seconds is not None
                else row_time
            )
            if bucket not in series_map[key]:
                series_map[key][bucket] = {
                    "recorded_at": bucket,
                    "count": 0,
                    "sum_value": Decimal("0"),
                    "min_value": None,
                    "max_value": None,
                }
            agg = series_map[key][bucket]
            value = self._to_decimal(row.value)
            if value is None:
                continue
            agg["count"] += 1
            agg["sum_value"] = agg["sum_value"] + value
            agg["min_value"] = value if agg["min_value"] is None else min(agg["min_value"], value)
            agg["max_value"] = value if agg["max_value"] is None else max(agg["max_value"], value)

        series: list[dict[str, object]] = []
        max_recorded_at: datetime | None = None
        for (metric, unit_name), buckets in sorted(series_map.items(), key=lambda item: item[0][0]):
            points: list[dict[str, object]] = []
            for bucket_time in sorted(buckets.keys()):
                agg = buckets[bucket_time]
                count = int(agg["count"])
                if count <= 0:
                    continue
                if max_recorded_at is None or bucket_time > max_recorded_at:
                    max_recorded_at = bucket_time
                sum_value = agg["sum_value"]
                avg_value = (sum_value / Decimal(str(count))) if count > 0 else None
                value = sum_value if metric == "energy" else avg_value
                points.append(
                    {
                        "recorded_at": bucket_time,
                        "value": value,
                        "unit": unit_name,
                        "count": count,
                        "min_value": agg["min_value"],
                        "max_value": agg["max_value"],
                        "avg_value": avg_value,
                        "sum_value": sum_value,
                    }
                )
            series.append({"metric_type": metric, "unit": unit_name, "points": points})
        return {
            "metric_type": normalized_metric,
            "interval": interval.strip().lower() if interval else None,
            "from_ts": from_utc,
            "to_ts": to_utc,
            "last_updated_at": max_recorded_at,
            "data_freshness_status": self._compute_data_freshness(
                max_recorded_at,
                offline_after_seconds=settings.telemetry_not_reporting_seconds,
            ),
            "series": series,
        }
