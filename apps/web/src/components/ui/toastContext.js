import { createContext } from "react";

/**
 * Internal context for the toast system. Not part of the public API —
 * consumers use <ToastProvider> (ToastProvider.jsx) and useToast() (useToast.js).
 * Kept in its own module so ToastProvider.jsx only exports the component
 * (react-refresh/only-export-components friendly).
 */
export const ToastContext = createContext(null);
