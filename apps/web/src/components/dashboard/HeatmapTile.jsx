function HeatmapTile({ title, value, level = "healthy", subtitle = "" }) {
  const bgByLevel = {
    healthy: "var(--color-success-soft)",
    warning: "var(--color-warning-soft)",
    critical: "var(--color-danger-soft)",
  };
  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        padding: 10,
        background: bgByLevel[level] || bgByLevel.healthy,
      }}
      title={`${title} (${level})`}
    >
      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{title}</div>
      <div style={{ fontWeight: 800, fontSize: 20, marginTop: 2 }}>{value}</div>
      {subtitle ? <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 3 }}>{subtitle}</div> : null}
    </div>
  );
}

export default HeatmapTile;
