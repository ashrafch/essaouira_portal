import StatusBadge from "./StatusBadge";

function HealthIndicator({ connectivity = "unknown", health = "unknown", battery = null }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <StatusBadge status={connectivity} />
      <StatusBadge status={health} />
      {battery != null ? (
        <span className="ui-status" style={{ background: "var(--color-surface-soft)", color: "var(--color-text-muted)", borderColor: "var(--color-border-strong)" }}>
          battery {battery}%
        </span>
      ) : null}
    </div>
  );
}

export default HealthIndicator;
