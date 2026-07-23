import { useState } from "react";
import { Info } from "lucide-react";
import { Button, Modal } from "./ui";

/**
 * Inline "i" affordance for a section: a small icon button that opens a short
 * explanation in the design-system modal. Complements the page-level help in
 * the top bar.
 */
export default function InfoHint({ title, children, label = "Informazioni" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="ui-info-hint"
        aria-label={label}
        title={label}
        onClick={() => setOpen(true)}
      >
        <Info size={15} aria-hidden="true" />
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title={title}
        footer={
          <Button size="sm" onClick={() => setOpen(false)}>
            Ho capito
          </Button>
        }
      >
        <div style={{ fontSize: 14, lineHeight: 1.5, color: "var(--color-text)" }}>{children}</div>
      </Modal>
    </>
  );
}
