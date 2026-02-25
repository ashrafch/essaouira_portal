import { useState } from "react";
import AppModal from "./AppModal";

function PageInfoHelp({ title, children, maxWidth = 760 }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={`Info ${title}`}
        onClick={() => setOpen(true)}
        style={{
          borderRadius: 999,
          border: "1px solid #cbd5e1",
          width: 24,
          height: 24,
          padding: 0,
          backgroundColor: "#ffffff",
          color: "#0f172a",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        i
      </button>
      <AppModal open={open} onClose={() => setOpen(false)} title={title} maxWidth={maxWidth}>
        <div style={{ display: "grid", gap: 10, fontSize: 13, color: "#334155" }}>{children}</div>
      </AppModal>
    </>
  );
}

export default PageInfoHelp;
