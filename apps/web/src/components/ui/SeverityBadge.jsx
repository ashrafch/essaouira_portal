import { AlertCircle, AlertTriangle, Info } from "lucide-react";

const MAP = {
  info: { bg: "var(--color-info-soft)", fg: "var(--color-info-strong)", border: "var(--color-info)", icon: Info },
  warning: { bg: "var(--color-warning-soft)", fg: "var(--color-warning-strong)", border: "var(--color-warning)", icon: AlertTriangle },
  critical: { bg: "var(--color-danger-soft)", fg: "var(--color-danger-strong)", border: "var(--color-danger)", icon: AlertCircle },
};

function SeverityBadge({ severity = "info" }) {
  const key = String(severity || "info").toLowerCase();
  const cfg = MAP[key] || MAP.info;
  const Icon = cfg.icon;
  return (
    <span
      className="ui-status"
      style={{ background: cfg.bg, color: cfg.fg, borderColor: cfg.border }}
      title={key}
    >
      <Icon size={12} />
      {key}
    </span>
  );
}

export default SeverityBadge;
