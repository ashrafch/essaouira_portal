import { Button, SegmentedToggle } from "../ui";
import { getTaskLabel } from "./staffHelpers";
import { controlsRow } from "./staffStyles";

const MODE_OPTIONS = [
  { value: "day", label: "Giorno" },
  { value: "week", label: "Settimana" },
];

/**
 * Header controls for the Staff board: reference date, day/week toggle,
 * unit + task-type filters, task count and the "new task" action.
 * Rendered inside PageHeader's `actions` slot; parent owns all state.
 */
function StaffFilters({
  selectedDate,
  setSelectedDate,
  mode,
  setMode,
  unitFilter,
  setUnitFilter,
  units,
  taskTypeFilter,
  setTaskTypeFilter,
  taskTypes,
  kpiTotal,
  onCreateTask,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div>
          <label
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              marginRight: 6,
            }}
          >
            Data di riferimento
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              borderRadius: 8,
              border: "1px solid var(--color-border-strong)",
              padding: "6px 8px",
              fontSize: 13,
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "flex-end" }}>
          <SegmentedToggle
            options={MODE_OPTIONS}
            value={mode}
            onChange={setMode}
            ariaLabel="Vista giorno o settimana"
          />
        </div>
      </div>
      <div style={controlsRow}>
        <div>
          <label
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              marginRight: 4,
            }}
          >
            Unità
          </label>
          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            style={{
              borderRadius: 8,
              border: "1px solid var(--color-border-strong)",
              padding: "4px 8px",
              fontSize: 12,
              minWidth: 140,
            }}
          >
            <option value="all">Tutte le unità</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              marginRight: 4,
            }}
          >
            Tipo task
          </label>
          <select
            value={taskTypeFilter}
            onChange={(e) => setTaskTypeFilter(e.target.value)}
            style={{
              borderRadius: 8,
              border: "1px solid var(--color-border-strong)",
              padding: "4px 8px",
              fontSize: 12,
              minWidth: 140,
            }}
          >
            <option value="all">Tutti i tipi</option>
            {taskTypes.map((tt) => (
              <option key={tt} value={tt}>
                {getTaskLabel(tt)}
              </option>
            ))}
          </select>
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
          Task nel periodo: <strong>{kpiTotal}</strong>
        </div>
        <Button variant="primary" size="sm" onClick={onCreateTask}>
          + Nuovo task
        </Button>
      </div>
    </div>
  );
}

export default StaffFilters;
