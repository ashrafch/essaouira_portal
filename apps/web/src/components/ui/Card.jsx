import { cn } from "./utils";
import "./ui.css";

const PADDING = {
  none: "0",
  sm: "12px",
  md: "16px",
  lg: "24px",
};

const ELEVATION = {
  flat: "none",
  sm: "var(--shadow-sm)",
  md: "var(--shadow-md)",
  lg: "var(--shadow-lg)",
};

/**
 * General-purpose surface card with padding/elevation variants.
 * Thin wrapper around the `ui-surface` token recipe — use this when
 * AppCard's fixed 16px padding + hover lift doesn't fit (e.g. compact
 * list rows, flat wells, or a larger elevated panel).
 *
 * Props: padding ("none"|"sm"|"md"|"lg"), elevation ("flat"|"sm"|"md"|"lg"),
 * as (element/tag to render, default "div").
 */
function Card({
  children,
  padding = "md",
  elevation = "sm",
  className = "",
  style = {},
  as,
  ...props
}) {
  const Tag = as || "div";
  const classes = cn("ui-surface ui-card-base", className);
  return (
    <Tag
      className={classes}
      style={{
        padding: PADDING[padding] ?? PADDING.md,
        boxShadow: ELEVATION[elevation] ?? ELEVATION.sm,
        ...style,
      }}
      {...props}
    >
      {children}
    </Tag>
  );
}

export default Card;
