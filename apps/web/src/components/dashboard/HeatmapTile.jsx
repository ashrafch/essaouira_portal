function HeatmapTile({ title, value, level = "healthy", subtitle = "" }) {
  const bgByLevel = {
    healthy: "linear-gradient(180deg, #ecfdf5 0%, #d1fae5 100%)",
    warning: "linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%)",
    critical: "linear-gradient(180deg, #fef2f2 0%, #fecaca 100%)",
  };
  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: 10,
        background: bgByLevel[level] || bgByLevel.healthy,
      }}
      title={`${title} (${level})`}
    >
      <div style={{ fontSize: 12, color: "#475569" }}>{title}</div>
      <div style={{ fontWeight: 800, fontSize: 20, marginTop: 2 }}>{value}</div>
      {subtitle ? <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>{subtitle}</div> : null}
    </div>
  );
}

export default HeatmapTile;
