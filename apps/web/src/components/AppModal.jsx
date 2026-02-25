function AppModal({ open, title, onClose, children, maxWidth = 760 }) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15,23,42,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth,
          maxHeight: "85vh",
          overflowY: "auto",
          borderRadius: 14,
          border: "1px solid #e5e7eb",
          backgroundColor: "#ffffff",
          boxShadow: "0 10px 30px rgba(15,23,42,0.25)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 14px",
            borderBottom: "1px solid #e5e7eb",
            position: "sticky",
            top: 0,
            backgroundColor: "#ffffff",
            zIndex: 1,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 15 }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "1px solid #d1d5db",
              borderRadius: 999,
              background: "#fff",
              color: "#111827",
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            Chiudi
          </button>
        </div>
        <div style={{ padding: 14 }}>{children}</div>
      </div>
    </div>
  );
}

export default AppModal;
