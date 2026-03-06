import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PageInfoHelp from "../components/PageInfoHelp";
import useIsMobile from "../hooks/useIsMobile";
import { getSmartUnitDetail, getSmartUnitTimeline } from "../services/api";

function badge(bg, color, border = "transparent") {
  return {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "3px 9px",
    fontSize: 11,
    fontWeight: 600,
    background: bg,
    color,
    border: `1px solid ${border}`,
    whiteSpace: "nowrap",
  };
}

function statusBadge(online) {
  if (online === true) return badge("#dcfce7", "#166534", "#86efac");
  if (online === false) return badge("#fee2e2", "#991b1b", "#fca5a5");
  return badge("#e2e8f0", "#334155", "#cbd5e1");
}

function severityBadge(value) {
  if (value === "critical") return badge("#fee2e2", "#991b1b", "#fca5a5");
  if (value === "warning") return badge("#fff7ed", "#9a3412", "#fed7aa");
  return badge("#e2e8f0", "#334155", "#cbd5e1");
}

function formatDateTime(value) {
  if (!value) return "n/d";
  return new Date(value).toLocaleString("it-IT");
}

function SmartUnitDetail() {
  const isMobile = useIsMobile(900);
  const { id } = useParams();
  const unitId = Number(id);
  const [data, setData] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [timelineHasMore, setTimelineHasMore] = useState(false);
  const [timelineNextBefore, setTimelineNextBefore] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [timelineLoadingMore, setTimelineLoadingMore] = useState(false);
  const [timelineError, setTimelineError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!Number.isFinite(unitId) || unitId <= 0) {
      setError("ID unita non valido");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    setTimelineLoading(true);
    setTimelineError("");
    try {
      const [payload, timelinePayload] = await Promise.all([
        getSmartUnitDetail(unitId, { events_limit: 30 }),
        getSmartUnitTimeline(unitId, { limit: 25 }),
      ]);
      setData(payload || null);
      setTimeline(timelinePayload?.items || []);
      setTimelineHasMore(Boolean(timelinePayload?.has_more));
      setTimelineNextBefore(timelinePayload?.next_before || null);
    } catch (err) {
      setError(err.message || "Errore caricando dettaglio smart unita");
      setTimelineError(err.message || "Errore caricando timeline unita");
    } finally {
      setLoading(false);
      setTimelineLoading(false);
    }
  }, [unitId]);

  useEffect(() => {
    load();
  }, [load]);

  const statesByDevice = useMemo(() => {
    const map = {};
    (data?.states || []).forEach((state) => {
      map[state.device_id] = state;
    });
    return map;
  }, [data]);

  const card = {
    background: "linear-gradient(180deg,#fff 0%,#f8fafc 100%)",
    borderRadius: 16,
    padding: 14,
    border: "1px solid #e2e8f0",
    boxShadow: "0 8px 20px rgba(15,23,42,0.05)",
  };

  async function loadMoreTimeline() {
    if (!timelineHasMore || !timelineNextBefore) return;
    setTimelineLoadingMore(true);
    try {
      const more = await getSmartUnitTimeline(unitId, {
        limit: 25,
        before: timelineNextBefore,
      });
      setTimeline((prev) => [...prev, ...(more?.items || [])]);
      setTimelineHasMore(Boolean(more?.has_more));
      setTimelineNextBefore(more?.next_before || null);
    } catch (err) {
      setTimelineError(err.message || "Errore caricando timeline aggiuntiva");
    } finally {
      setTimelineLoadingMore(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Smart Unit Detail</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Vista completa dispositivi, stati, alert ed eventi per unita.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link
            to="/smart-overview"
            style={{
              textDecoration: "none",
              borderRadius: 999,
              border: "1px solid #d1d5db",
              padding: "6px 12px",
              fontSize: 12,
              background: "#fff",
              color: "#0f172a",
              fontWeight: 600,
            }}
          >
            Torna a Smart Overview
          </Link>
          <PageInfoHelp title="Come usare Smart Unit Detail">
            <p>Questa pagina aggrega il dominio smart per una singola unita PMS.</p>
            <p>Unit PMS resta la fonte dati principale; device/alert/eventi sono letti per unit_id.</p>
          </PageInfoHelp>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={load}
          style={{ borderRadius: 999, border: "1px solid #d1d5db", padding: "6px 12px", fontSize: 12, background: "white", cursor: "pointer" }}
        >
          Aggiorna dettaglio
        </button>
      </div>

      {loading ? <div style={card}>Caricamento dettaglio unita smart...</div> : null}
      {error ? <div style={{ ...card, color: "#b91c1c" }}>{error}</div> : null}

      {!loading && !error && data ? (
        <>
          <div style={card}>
            <div style={{ display: "grid", gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{data.unit.name}</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <span style={badge("#eef2ff", "#3730a3", "#c7d2fe")}>ID #{data.unit.id}</span>
                <span style={badge("#f8fafc", "#334155", "#cbd5e1")}>capienza {data.unit.capacity ?? "n/d"}</span>
                <span style={badge("#ecfeff", "#0e7490", "#a5f3fc")}>mq {data.unit.size_m2 ?? "n/d"}</span>
                <span style={badge("#fff7ed", "#9a3412", "#fed7aa")}>
                  base rate {data.unit.base_nightly_rate ?? "n/d"} {data.unit.currency || "EUR"}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(6, minmax(120px, 1fr))", gap: 10 }}>
            <div style={card}>
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Device</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{data.summary.total_devices}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Online</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#15803d" }}>{data.summary.online_devices}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Offline</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#b91c1c" }}>{data.summary.offline_devices}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Unknown</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{data.summary.unknown_state_devices}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Alert open</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#b91c1c" }}>{data.summary.open_alerts}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Alert resolved</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#166534" }}>{data.summary.resolved_alerts}</div>
            </div>
          </div>

          <div style={card}>
            <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 15 }}>Dispositivi collegati</h3>
            {(data.devices || []).length === 0 ? (
              <div style={{ fontSize: 13, color: "#64748b" }}>Nessun device associato a questa unita.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {data.devices.map((device) => {
                  const state = statesByDevice[device.id] || null;
                  return (
                    <div key={device.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 10, background: "#fff" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{device.name}</div>
                          <div style={{ fontSize: 12, color: "#64748b" }}>{device.external_id}</div>
                        </div>
                        <span style={statusBadge(state?.online)}>
                          {state?.online === true ? "online" : state?.online === false ? "offline" : "unknown"}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        <span style={badge("#eef2ff", "#3730a3", "#c7d2fe")}>{device.provider}</span>
                        <span style={badge("#f8fafc", "#334155", "#cbd5e1")}>{device.category}</span>
                        <span style={badge("#fff7ed", "#9a3412", "#fed7aa")}>health {device.health_status}</span>
                        <span style={badge("#ecfeff", "#0e7490", "#a5f3fc")}>battery {device.battery_level ?? "n/d"}%</span>
                        <span style={badge("#f0fdf4", "#166534", "#86efac")}>power {state?.power_state || "n/d"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
            <div style={card}>
              <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 15 }}>Alert aperti</h3>
              {(data.alerts_open || []).length === 0 ? (
                <div style={{ fontSize: 13, color: "#64748b" }}>Nessun alert aperto.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {data.alerts_open.map((alert) => (
                    <div key={alert.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 10, background: "#fff" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <strong>{alert.title}</strong>
                        <span style={severityBadge(alert.severity)}>{alert.severity}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#334155", marginTop: 4 }}>{alert.alert_type}</div>
                      {alert.description ? <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{alert.description}</div> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={card}>
              <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 15 }}>Alert risolti / presi in carico</h3>
              {(data.alerts_resolved || []).length === 0 ? (
                <div style={{ fontSize: 13, color: "#64748b" }}>Nessun alert risolto o acknowledged.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {data.alerts_resolved.map((alert) => (
                    <div key={alert.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 10, background: "#fff" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <strong>{alert.title}</strong>
                        <span style={badge("#dcfce7", "#166534", "#86efac")}>{alert.status}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                        aggiornato: {formatDateTime(alert.last_seen_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={card}>
            <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 15 }}>Timeline unificata unità</h3>
            <p style={{ marginTop: 0, fontSize: 12, color: "#64748b" }}>
              Eventi smart + operativi rilevanti (booking, task staff, manutenzione).
            </p>
            {timelineLoading ? (
              <div style={{ fontSize: 13, color: "#64748b" }}>Caricamento timeline...</div>
            ) : null}
            {timelineError ? (
              <div style={{ fontSize: 13, color: "#b91c1c" }}>{timelineError}</div>
            ) : null}
            {!timelineLoading && !timelineError && timeline.length === 0 ? (
              <div style={{ fontSize: 13, color: "#64748b" }}>Nessun evento timeline per questa unità.</div>
            ) : null}
            {!timelineLoading && !timelineError && timeline.length > 0 ? (
              <div style={{ display: "grid", gap: 8 }}>
                {timeline.map((item) => (
                  <div
                    key={item.timeline_id}
                    style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 10, background: "#fff" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 700 }}>{item.title}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span style={badge("#eef2ff", "#3730a3", "#c7d2fe")}>{item.category}</span>
                        <span style={severityBadge(item.severity)}>{item.severity}</span>
                      </div>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, color: "#334155" }}>{item.event_type}</div>
                    {item.description ? (
                      <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>{item.description}</div>
                    ) : null}
                    <div style={{ marginTop: 6, fontSize: 11, color: "#64748b", display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span>{formatDateTime(item.occurred_at)}</span>
                      <span>source: {item.source}</span>
                      {item.device_id ? <span>device #{item.device_id}</span> : null}
                      {item.alert_id ? <span>alert #{item.alert_id}</span> : null}
                      {item.command_id ? <span>cmd #{item.command_id}</span> : null}
                      {item.booking_id ? <span>booking #{item.booking_id}</span> : null}
                      {item.task_id ? <span>task #{item.task_id}</span> : null}
                      {item.maintenance_id ? <span>mnt #{item.maintenance_id}</span> : null}
                    </div>
                  </div>
                ))}
                {timelineHasMore ? (
                  <div>
                    <button
                      type="button"
                      onClick={loadMoreTimeline}
                      disabled={timelineLoadingMore}
                      style={{
                        borderRadius: 999,
                        border: "1px solid #d1d5db",
                        padding: "6px 12px",
                        fontSize: 12,
                        background: "white",
                        cursor: "pointer",
                      }}
                    >
                      {timelineLoadingMore ? "Caricamento..." : "Carica altri eventi"}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default SmartUnitDetail;
