import { motion } from "framer-motion";
import AppCard from "./AppCard";

const MotionValue = motion.div;

function StatCard({ label, value, hint, icon = null, tone = "default" }) {
  const tones = {
    default: "#111827",
    success: "#047857",
    warning: "#b45309",
    danger: "#b91c1c",
    info: "#1d4ed8",
  };
  return (
    <AppCard hover>
      <div className="ui-kpi-label">{label}</div>
      <MotionValue
        key={`${label}-${value}`}
        initial={{ opacity: 0.5, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="ui-kpi-value"
        style={{ color: tones[tone] || tones.default }}
      >
        {icon ? <span style={{ marginRight: 8 }}>{icon}</span> : null}
        {value}
      </MotionValue>
      {hint ? <div className="ui-subtitle">{hint}</div> : null}
    </AppCard>
  );
}

export default StatCard;
