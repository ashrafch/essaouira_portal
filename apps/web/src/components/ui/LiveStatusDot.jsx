function LiveStatusDot({ active = false, title = "Live" }) {
  return (
    <span
      title={title}
      style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        background: active ? "var(--color-success)" : "var(--color-text-subtle)",
        boxShadow: active ? "0 0 0 4px var(--color-success-soft)" : "none",
        display: "inline-block",
      }}
    />
  );
}

export default LiveStatusDot;
