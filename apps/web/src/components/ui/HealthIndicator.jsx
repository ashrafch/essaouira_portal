import StatusBadge from "./StatusBadge";

function HealthIndicator({ connectivity = "unknown", health = "unknown", battery = null }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <StatusBadge status={connectivity} />
      <StatusBadge status={health} />
      {battery != null ? (
        <span className="ui-status" style={{ background: "#f8fafc", color: "#334155", borderColor: "#cbd5e1" }}>
          battery {battery}%
        </span>
      ) : null}
    </div>
  );
}

export default HealthIndicator;
