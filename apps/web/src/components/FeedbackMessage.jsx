function FeedbackMessage({ message, type = "info", onClose }) {
  if (!message) return null;
  const palette =
    type === "success"
      ? { bg: "#ecfdf5", border: "#86efac", text: "#166534" }
      : type === "error"
      ? { bg: "#fef2f2", border: "#fca5a5", text: "#b91c1c" }
      : { bg: "#eff6ff", border: "#93c5fd", text: "#1d4ed8" };

  return (
    <div
      style={{
        background: palette.bg,
        border: "1px solid " + palette.border,
        color: palette.text,
        borderRadius: 10,
        padding: "10px 12px",
        fontSize: 12,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span>{message}</span>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          style={{
            border: "1px solid " + palette.border,
            background: "#fff",
            color: palette.text,
            borderRadius: 999,
            padding: "2px 8px",
            cursor: "pointer",
          }}
        >
          OK
        </button>
      ) : null}
    </div>
  );
}

export default FeedbackMessage;
