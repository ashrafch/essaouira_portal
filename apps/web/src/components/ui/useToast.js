import { useContext } from "react";
import { ToastContext } from "./toastContext";

/**
 * Hook to trigger toasts from anywhere below <ToastProvider>.
 * Returns { notify(message, options), dismiss(id), success(message, options),
 * error(message, options), warning(message, options), info(message, options) }.
 *
 * options: { title?, duration? (ms, 0 = sticky), id? }
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return ctx;
}
