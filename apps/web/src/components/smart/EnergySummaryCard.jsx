import { AppCard } from "../ui";

function asNumber(value, digits = 2) {
  if (value === null || value === undefined) return "n/d";
  const number = Number(value);
  if (Number.isNaN(number)) return "n/d";
  return number.toFixed(digits);
}

function EnergySummaryCard({ summary, title = "Energy summary" }) {
  return (
    <AppCard>
      <h3 style={{ marginBottom: 8 }}>{title}</h3>
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Energia 24h</div>
          <strong>{asNumber(summary?.total_energy_kwh)} kWh</strong>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Potenza media</div>
          <strong>{asNumber(summary?.avg_power_w)} W</strong>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Energy spike</div>
          <strong>{summary?.energy_spikes ?? 0}</strong>
        </div>
      </div>
    </AppCard>
  );
}

export default EnergySummaryCard;
