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
    <AppCard hover>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 800 }}>{device.name}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            {device.provider} · {device.category} · {device.external_id}
          </div>
          <div style={{ fontSize: 12, color: "#334155", marginTop: 4 }}>
            Unita: <strong>{device.unit_name || "Non assegnata"}</strong>
          </div>
          {boolStateLabel ? (
            <div style={{ marginTop: 6 }}>
              <span className="ui-status" style={{ background: "#eef2ff", color: "#3730a3", borderColor: "#c7d2fe" }}>
                {boolStateLabel}
              </span>
            </div>
          ) : null}
          <div style={{ marginTop: 8 }}>
            <HealthIndicator
              connectivity={device.connectivity_status}
              health={device.health_status}
              battery={device.battery_level}
            />
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="ui-status" style={{ background: "#f8fafc", color: "#334155", borderColor: "#cbd5e1" }}>
              <Signal size={12} /> rssi {device.signal_strength ?? "-"}
            </span>
            <span className="ui-status" style={{ background: "#f8fafc", color: "#334155", borderColor: "#cbd5e1" }}>
              <Wifi size={12} /> seen {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : "n/d"}
            </span>
            {device.needs_attention ? <StatusBadge status="warning" /> : null}
          </div>
        </div>
        <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
          {onAssignUnit ? (
            <select
              value={device.unit_id || ""}
              onChange={(e) => onAssignUnit(device.device_id, e.target.value ? Number(e.target.value) : null)}
              disabled={assigning}
              style={{ minWidth: 170 }}
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
