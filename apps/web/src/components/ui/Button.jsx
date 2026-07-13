import { Loader2 } from "lucide-react";
import { cn } from "./utils";
import "./ui.css";

const VARIANT_CLASS = {
  primary: "ui-btn-primary",
  secondary: "ui-btn-secondary",
  ghost: "ui-btn-ghost",
  danger: "ui-btn-danger",
  subtle: "ui-btn-subtle",
};

const SIZE_CLASS = {
  sm: "ui-btn-sm",
  md: "ui-btn-md",
  lg: "ui-btn-lg",
};

/**
 * Shared button primitive.
 * Props: variant ("primary"|"secondary"|"ghost"|"danger"|"subtle"),
 * size ("sm"|"md"|"lg"), icon (leading element/icon), loading (bool),
 * disabled (bool). Any other prop (onClick, type, aria-*...) passes through.
 */
function Button({
  children,
  variant = "primary",
  size = "md",
  icon = null,
  loading = false,
  disabled = false,
  className = "",
  type = "button",
  ...props
}) {
  const classes = cn(
    "ui-btn",
    VARIANT_CLASS[variant] || VARIANT_CLASS.primary,
    SIZE_CLASS[size] || SIZE_CLASS.md,
    className,
  );

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 size={14} className="ui-btn-spinner" aria-hidden="true" /> : icon}
      {children ? <span>{children}</span> : null}
    </button>
  );
}

export default Button;
