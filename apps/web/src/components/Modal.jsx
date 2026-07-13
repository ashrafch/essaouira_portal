import { useEffect } from "react";

function Modal({
  open,
  title,
  children,
  onClose,
  footer = null,
  width = 760,
}) {
  useEffect(() => {
    if (!open) return undefined;
    function handleEsc(event) {
      if (event.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--color-overlay)",
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(100%, " + width + "px)",
          maxHeight: "92vh",
          overflowY: "auto",
          background: "var(--color-surface)",
          borderRadius: 14,
          border: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16 }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "1px solid var(--color-border-strong)",
              background: "var(--color-surface)",
              color: "var(--color-text-muted)",
              borderRadius: 999,
              padding: "4px 10px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Chiudi
          </button>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
        {footer ? (
          <div
            style={{
              padding: 16,
              borderTop: "1px solid var(--color-border)",
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              flexWrap: "wrap",
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default Modal;
