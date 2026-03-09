import { AlertCircle, AlertTriangle, Info } from "lucide-react";

const MAP = {
  info: { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe", icon: Info },
  warning: { bg: "#fffbeb", fg: "#92400e", border: "#fde68a", icon: AlertTriangle },
  critical: { bg: "#fef2f2", fg: "#991b1b", border: "#fecaca", icon: AlertCircle },
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
