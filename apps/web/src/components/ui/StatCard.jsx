import { motion } from "framer-motion";
import { TrendingDown, TrendingUp } from "lucide-react";
import AppCard from "./AppCard";

const MotionValue = motion.div;

const TONES = {
  default: "var(--color-text)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
  info: "var(--color-info)",
  accent: "var(--color-accent)",
};

/** Tiny inline SVG sparkline — no chart library. */
function Sparkline({ series, color, width = 72, height = 28 }) {
  if (!Array.isArray(series) || series.length < 2) return null;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const step = width / (series.length - 1);

  const points = series
    .map((point, index) => {
      const x = index * step;
      const y = height - ((point - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const lastIndex = series.length - 1;
  const lastX = lastIndex * step;
  const lastY = height - ((series[lastIndex] - min) / range) * height;

  return (
    <svg
      className="ui-sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r="2.4" fill={color} />
    </svg>
  );
}

function Trend({ trend, trendLabel }) {
  if (trend === null || trend === undefined) return null;
  const numeric = Number(trend);
  if (Number.isNaN(numeric)) return null;
  const isUp = numeric >= 0;
  const color = isUp ? "var(--color-success)" : "var(--color-danger)";
  const Icon = isUp ? TrendingUp : TrendingDown;
  return (
    <span className="ui-trend" style={{ color }}>
      <Icon size={13} aria-hidden="true" />
      {isUp ? "+" : ""}
      {numeric.toFixed(1)}%{trendLabel ? <span className="ui-trend-label">{trendLabel}</span> : null}
    </span>
  );
}

/**
 * KPI card. Backward compatible with the original API
 * ({ label, value, hint, icon, tone }); optionally accepts:
 * - trend: number (percent change, e.g. 12.5 or -3.2) — renders a colored up/down arrow.
 * - trendLabel: string — small caption after the trend (e.g. "vs last week").
 * - series: number[] — renders a tiny inline sparkline (no chart lib).
 */
function StatCard({
  label,
  value,
  hint,
  icon = null,
  tone = "default",
  trend = null,
  trendLabel = "",
  series = null,
}) {
  const color = TONES[tone] || TONES.default;
  const sparklineColor = tone === "default" ? "var(--color-primary)" : color;

  return (
    <AppCard hover>
      <div className="ui-kpi-header">
        <div className="ui-kpi-label">{label}</div>
        {series ? <Sparkline series={series} color={sparklineColor} /> : null}
      </div>
      <div className="ui-kpi-row">
        <MotionValue
          key={`${label}-${value}`}
          initial={{ opacity: 0.5, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="ui-kpi-value"
          style={{ color }}
        >
          {icon ? <span style={{ marginRight: 8 }}>{icon}</span> : null}
          {value}
        </MotionValue>
        <Trend trend={trend} trendLabel={trendLabel} />
      </div>
      {hint ? <div className="ui-subtitle">{hint}</div> : null}
    </AppCard>
  );
}

export default StatCard;
