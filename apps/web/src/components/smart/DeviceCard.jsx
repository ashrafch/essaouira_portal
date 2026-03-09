import { Signal, Wifi } from "lucide-react";
import { AppCard, HealthIndicator, StatusBadge } from "../ui";

function DeviceCard({ device, onSimulate = null }) {
  return (
    <AppCard hover>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 800 }}>{device.name}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            {device.provider} · {device.category}
          </div>
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
              <Wifi size={12} /> seen {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : "n/a"}
            </span>
            {device.needs_attention ? <StatusBadge status="warning" /> : null}
          </div>
        </div>
        {onSimulate ? (
          <button type="button" onClick={() => onSimulate(device.device_id)}>
            Simula sync
          </button>
        ) : null}
      </div>
    </AppCard>
  );
}

export default DeviceCard;


