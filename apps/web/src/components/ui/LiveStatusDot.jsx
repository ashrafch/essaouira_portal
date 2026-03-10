function LiveStatusDot({ active = false, title = "Live" }) {
  return (
    <span
      title={title}
      style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        background: active ? "#16a34a" : "#94a3b8",
        boxShadow: active ? "0 0 0 4px rgba(22,163,74,0.12)" : "none",
        display: "inline-block",
      }}
    />
  );
}

export default LiveStatusDot;
