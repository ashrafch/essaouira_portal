import { AppCard } from "../ui";

function asNumber(value) {
  if (value === null || value === undefined) return "n/d";
  const number = Number(value);
  if (Number.isNaN(number)) return "n/d";
  return number.toFixed(1);
}

function EnvironmentSummaryCard({ summary, title = "Environment summary" }) {
  return (
    <AppCard>
      <h3 style={{ marginBottom: 8 }}>{title}</h3>
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
        <div>
          <div style={{ fontSize: 12, color: "#64748b" }}>Temp media</div>
          <strong>{asNumber(summary?.avg_temperature)} C</strong>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#64748b" }}>Temp min/max</div>
          <strong>{asNumber(summary?.min_temperature)} / {asNumber(summary?.max_temperature)} C</strong>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#64748b" }}>Umidità media</div>
          <strong>{asNumber(summary?.avg_humidity)} %</strong>
        </div>
      </div>
    </AppCard>
  );
}

export default EnvironmentSummaryCard;
