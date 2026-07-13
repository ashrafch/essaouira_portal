function FeedbackMessage({ message, type = "info", onClose }) {
  if (!message) return null;
  const palette =
    type === "success"
      ? { bg: "var(--color-success-soft)", border: "var(--color-success)", text: "var(--color-success-strong)" }
      : type === "error"
      ? { bg: "var(--color-danger-soft)", border: "var(--color-danger)", text: "var(--color-danger-strong)" }
      : { bg: "var(--color-info-soft)", border: "var(--color-info)", text: "var(--color-info-strong)" };

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
            background: "var(--color-surface)",
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
