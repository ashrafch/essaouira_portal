import { Signal, Wifi } from "lucide-react";
import { AppCard, HealthIndicator, StatusBadge } from "../ui";

function DeviceCard({
  device,
  units = [],
  onSimulate = null,
  onOpenDetail = null,
  onAssignUnit = null,
  onDelete = null,
  assigning = false,
  deleting = false,
}) {
  const boolStateLabel = (() => {
    if (typeof device.contact_open === "boolean") {
      return device.contact_open ? "Porta/Finestra: aperta" : "Porta/Finestra: chiusa";
    }
    if (typeof device.motion_detected === "boolean") {
      return device.motion_detected ? "Movimento: rilevato" : "Movimento: assente";
    }
    if (typeof device.leak_detected === "boolean") {
      return device.leak_detected ? "Leak: rilevata" : "Leak: assente";
    }
    if (typeof device.power_state === "string" && device.power_state.trim()) {
      return `Power: ${device.power_state}`;
    }
    return null;
  })();

  return (
    <AppCard hover className="smart-device-card">
      <div className="smart-device-card__content">
        <div className="smart-device-card__main">
          <div className="smart-device-card__title">{device.name}</div>
          <div className="smart-device-card__meta">
            <span>{device.provider}</span>
            <span>{device.category}</span>
            <span className="smart-device-card__external-id">{device.external_id}</span>
          </div>
          <div className="smart-device-card__unit">
            Unita: <strong>{device.unit_name || "Non assegnata"}</strong>
          </div>
          {boolStateLabel ? (
            <div className="smart-device-card__state">
              <span className="ui-status smart-device-card__state-chip">
                {boolStateLabel}
              </span>
            </div>
          ) : null}
          <div className="smart-device-card__health">
            <HealthIndicator
              connectivity={device.connectivity_status}
              health={device.health_status}
              battery={device.battery_level}
            />
          </div>
          <div className="smart-device-card__badges">
            <span className="ui-status smart-device-card__badge">
              <Signal size={12} /> rssi {device.signal_strength ?? "-"}
            </span>
            <span className="ui-status smart-device-card__badge">
              <Wifi size={12} /> seen {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : "n/d"}
            </span>
            {device.needs_attention ? <StatusBadge status="warning" /> : null}
          </div>
        </div>
        <div className="smart-device-card__actions">
          {onAssignUnit ? (
            <select
              value={device.unit_id || ""}
              onChange={(e) => onAssignUnit(device.device_id, e.target.value ? Number(e.target.value) : null)}
              disabled={assigning}
              className="smart-device-card__select"
            >
              <option value="">Assegna unita...</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          ) : null}
          {onOpenDetail ? (
            <button type="button" onClick={() => onOpenDetail(device.device_id)}>
              Apri dettaglio
            </button>
          ) : null}
          {onSimulate ? (
            <button type="button" onClick={() => onSimulate(device.device_id)}>
              Simula sync
            </button>
          ) : null}
          {onDelete ? (
            <button type="button" onClick={() => onDelete(device.device_id)} disabled={deleting}>
              {deleting ? "Elimino..." : "Elimina"}
            </button>
          ) : null}
        </div>
      </div>
    </AppCard>
  );
}

export default DeviceCard;
