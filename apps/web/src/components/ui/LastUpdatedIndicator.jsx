import { useEffect, useState } from "react";

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatAgo(date) {
  if (!date) return "n/d";
  const delta = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (delta < 60) return `${delta}s fa`;
  const minutes = Math.floor(delta / 60);
  if (minutes < 60) return `${minutes}m fa`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h fa`;
}

function LastUpdatedIndicator({ value, label = "Aggiornato" }) {
  const [, setTick] = useState(0);
  const dateValue = toDate(value);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((v) => v + 1), 10000);
    return () => window.clearInterval(timer);
  }, []);

  const text = formatAgo(dateValue);
  return (
    <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
      {label}: {text}
    </span>
  );
}

export default LastUpdatedIndicator;
