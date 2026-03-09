import { AlertTriangle, CheckCircle2, Circle, XCircle } from "lucide-react";
import "./ui.css";

const STATUS_MAP = {
  online: { bg: "#ecfdf5", fg: "#065f46", border: "#a7f3d0", icon: CheckCircle2 },
  healthy: { bg: "#ecfdf5", fg: "#065f46", border: "#a7f3d0", icon: CheckCircle2 },
  warning: { bg: "#fffbeb", fg: "#92400e", border: "#fde68a", icon: AlertTriangle },
  critical: { bg: "#fef2f2", fg: "#991b1b", border: "#fecaca", icon: XCircle },
  offline: { bg: "#f3f4f6", fg: "#374151", border: "#d1d5db", icon: Circle },
  default: { bg: "#eff6ff", fg: "#1e40af", border: "#bfdbfe", icon: Circle },
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
