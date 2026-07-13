import { useCallback, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { ToastContext } from "./toastContext";
import "./ui.css";

const TONES = {
  success: { icon: CheckCircle2, className: "ui-toast-success" },
  error: { icon: XCircle, className: "ui-toast-error" },
  warning: { icon: AlertTriangle, className: "ui-toast-warning" },
  info: { icon: Info, className: "ui-toast-info" },
};

let idSeq = 0;

/**
 * Lightweight toast/notification system. Wrap the app once with
 * <ToastProvider>, then call useToast() (see useToast.js) anywhere below it.
 *
 * Toasts stack bottom-right, auto-dismiss (configurable), and are
 * accessible (role="status" per toast — implicit aria-live="polite").
 *
 * Props: defaultDuration (ms, default 4500).
 */
function ToastProvider({ children, defaultDuration = 4500 }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (message, options = {}) => {
      const id = options.id ?? `toast-${++idSeq}`;
      const tone = options.tone || options.type || "info";
      const duration = options.duration ?? defaultDuration;
      setToasts((prev) => [...prev, { id, message, tone, title: options.title || null }]);
      if (duration > 0) {
        const timer = window.setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [defaultDuration, dismiss],
  );

  const api = useMemo(
    () => ({
      notify,
      dismiss,
      success: (message, options) => notify(message, { ...options, tone: "success" }),
      error: (message, options) => notify(message, { ...options, tone: "error" }),
      warning: (message, options) => notify(message, { ...options, tone: "warning" }),
      info: (message, options) => notify(message, { ...options, tone: "info" }),
    }),
    [notify, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="ui-toast-stack">
        {toasts.map((toast) => {
          const cfg = TONES[toast.tone] || TONES.info;
          const Icon = cfg.icon;
          return (
            <div key={toast.id} role="status" className={`ui-toast ${cfg.className}`}>
              <Icon size={16} aria-hidden="true" className="ui-toast-icon" />
              <div className="ui-toast-body">
                {toast.title ? <div className="ui-toast-title">{toast.title}</div> : null}
                <div className="ui-toast-message">{toast.message}</div>
              </div>
              <button
                type="button"
                className="ui-toast-close"
                onClick={() => dismiss(toast.id)}
                aria-label="Chiudi notifica"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export default ToastProvider;
