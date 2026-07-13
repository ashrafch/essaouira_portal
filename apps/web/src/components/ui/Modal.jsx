import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "./utils";
import "./ui.css";

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const SIZE_WIDTH = { sm: 420, md: 640, lg: 880 };

/**
 * Single accessible modal system for the app (role=dialog, aria-modal,
 * ESC to close, optional focus trap, backdrop = var(--color-overlay)).
 * This is additive: existing top-level Modal.jsx / MessageModal.jsx are
 * untouched — pages migrate to this one over time.
 *
 * Props:
 * - open: bool
 * - onClose: () => void
 * - title / description: optional header content (header is omitted if no title)
 * - footer: node — right-aligned action row
 * - size: "sm" | "md" | "lg" (max-width)
 * - closeOnBackdrop: bool (default true)
 * - trapFocus: bool (default true)
 */
function Modal({
  open,
  onClose,
  title,
  description = "",
  children,
  footer = null,
  size = "md",
  closeOnBackdrop = true,
  trapFocus = true,
  className = "",
}) {
  const dialogRef = useRef(null);
  const lastFocusedRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    lastFocusedRef.current = document.activeElement;
    const node = dialogRef.current;
    const firstFocusable = node?.querySelector(FOCUSABLE_SELECTOR);
    (firstFocusable || node)?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose?.();
        return;
      }
      if (!trapFocus || event.key !== "Tab" || !node) return;
      const focusableEls = node.querySelectorAll(FOCUSABLE_SELECTOR);
      if (focusableEls.length === 0) return;
      const first = focusableEls[0];
      const last = focusableEls[focusableEls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (lastFocusedRef.current && typeof lastFocusedRef.current.focus === "function") {
        lastFocusedRef.current.focus();
      }
    };
  }, [open, onClose, trapFocus]);

  if (!open) return null;

  return (
    <div className="ui-modal-overlay" role="presentation" onClick={closeOnBackdrop ? onClose : undefined}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        className={cn("ui-modal", className)}
        style={{ maxWidth: SIZE_WIDTH[size] || SIZE_WIDTH.md }}
        onClick={(event) => event.stopPropagation()}
      >
        {title ? (
          <div className="ui-modal-header">
            <div>
              <h2 className="ui-modal-title">{title}</h2>
              {description ? <p className="ui-modal-description">{description}</p> : null}
            </div>
            <button type="button" className="ui-modal-close" onClick={onClose} aria-label="Chiudi">
              <X size={16} />
            </button>
          </div>
        ) : null}
        <div className="ui-modal-body">{children}</div>
        {footer ? <div className="ui-modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

export default Modal;
