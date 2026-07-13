import { AlertTriangle, CheckCircle2, Circle, XCircle } from "lucide-react";
import "./ui.css";

const STATUS_MAP = {
  online: { bg: "var(--color-success-soft)", fg: "var(--color-success-strong)", border: "var(--color-success)", icon: CheckCircle2 },
  healthy: { bg: "var(--color-success-soft)", fg: "var(--color-success-strong)", border: "var(--color-success)", icon: CheckCircle2 },
  warning: { bg: "var(--color-warning-soft)", fg: "var(--color-warning-strong)", border: "var(--color-warning)", icon: AlertTriangle },
  critical: { bg: "var(--color-danger-soft)", fg: "var(--color-danger-strong)", border: "var(--color-danger)", icon: XCircle },
  offline: { bg: "var(--color-surface-soft)", fg: "var(--color-text-muted)", border: "var(--color-border-strong)", icon: Circle },
  default: { bg: "var(--color-info-soft)", fg: "var(--color-info-strong)", border: "var(--color-info)", icon: Circle },
};

function StatusBadge({ status }) {
  const normalized = String(status || "default").toLowerCase();
  const cfg = STATUS_MAP[normalized] || STATUS_MAP.default;
  const Icon = cfg.icon;
  return (
    <span
      className="ui-status"
      style={{ background: cfg.bg, color: cfg.fg, borderColor: cfg.border }}
      title={normalized}
    >
      <Icon size={12} />
      {normalized}
    </span>
  );
}

export default StatusBadge;
