import { formatCurrency } from "../../utils/format";
import {
  card,
  sectionTitle,
  kpiGrid,
  kpiCard,
  tinyLabel,
  tinyValue,
} from "./staffStyles";

/**
 * Summary KPIs for the filtered task set: totals, hours, cost.
 * `kpi` is computed in the parent from filteredTasks.
 */
function StaffKpiCard({ kpi }) {
  return (
    <div style={card}>
      <div style={sectionTitle}>Riepilogo carico staff</div>
      <div style={kpiGrid}>
        <div style={kpiCard}>
          <div style={tinyLabel}>Task totali</div>
          <div style={tinyValue}>{kpi.total}</div>
          <div style={{ fontSize: 11, color: "var(--color-text-subtle)" }}>
            Done: {kpi.byStatus.done || 0} · Planned:{" "}
            {kpi.byStatus.planned || 0}
          </div>
        </div>
        <div style={kpiCard}>
          <div style={tinyLabel}>Ore stimate</div>
          <div style={tinyValue}>{kpi.hours.toFixed(1)}</div>
          <div style={{ fontSize: 11, color: "var(--color-text-subtle)" }}>
            Totale task filtrate
          </div>
        </div>
        <div style={kpiCard}>
          <div style={tinyLabel}>Costo</div>
          <div style={tinyValue}>
            {formatCurrency(kpi.costTotal, "EUR", { decimals: 2 })}
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-subtle)" }}>
            Business (Staff)
          </div>
        </div>
      </div>
    </div>
  );
}

export default StaffKpiCard;
