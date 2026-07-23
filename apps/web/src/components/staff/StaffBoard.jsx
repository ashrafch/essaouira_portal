import { Button } from "../ui";
import { formatDate, getTaskLabel } from "./staffHelpers";
import QuickCreateForm from "./QuickCreateForm";
import {
  card,
  sectionTitle,
  boardWrapper,
  board,
  boardHeaderCell,
  boardDayCell,
  boardCell,
  miniTaskCard,
  infoRow,
  tagType,
  inputInline,
  pillStatus,
} from "./staffStyles";

/**
 * Right-column board (shared day/week rendering — driven by `mode`/`days`).
 * Renders the assignee columns, per-day cells, the read-only mini task cards
 * and the inline quick-create form. Parent owns all state and callbacks.
 */
function StaffBoard({
  mode,
  selectedDate,
  from_date,
  to_date,
  assignees,
  visibleAssignees,
  staffColumnsPerPage,
  staffPage,
  setStaffPage,
  totalStaffPages,
  loading,
  filteredTasks,
  staffColorMap,
  days,
  tasksByAssigneeAndDay,
  quickCreateTarget,
  unitMap,
  savingTaskId,
  assigneeOptions,
  onChangeAssignee,
  onChangeCost,
  onBlurCost,
  onChangeHours,
  onBlurHours,
  onToggleStatus,
  onEditTask,
  onOpenQuickCreate,
  quick,
}) {
  return (
    <div style={card}>
      <div style={sectionTitle}>
        {mode === "day"
          ? `Vista giornaliera · ${formatDate(selectedDate)}`
          : `Vista settimanale · ${formatDate(from_date)} → ${formatDate(
              to_date
            )}`}
      </div>

      {mode === "week" && assignees.length > staffColumnsPerPage && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setStaffPage((p) => Math.max(0, p - 1))}
            disabled={staffPage === 0}
          >
            Staff precedenti
          </Button>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Pagina staff {staffPage + 1}/{totalStaffPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setStaffPage((p) => Math.min(totalStaffPages - 1, p + 1))
            }
            disabled={staffPage >= totalStaffPages - 1}
          >
            Staff successivi
          </Button>
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 13 }}>Caricamento task staff...</p>
      ) : filteredTasks.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          Nessun task staff per il periodo e i filtri selezionati.
        </p>
      ) : (
        <div style={boardWrapper}>
          <div style={board(visibleAssignees.length)}>
            {/* header: colonna giorni + colonne per assignee */}
            <div style={boardHeaderCell}>Giorno</div>
            {visibleAssignees.map((ass) => {
              const color = staffColorMap[ass];
              return (
                <div key={ass} style={boardHeaderCell}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    {color && (
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "999px",
                          backgroundColor: color,
                          border: "1px solid var(--color-border)",
                        }}
                      />
                    )}
                    <span>{ass}</span>
                  </div>
                </div>
              );
            })}

            {/* righe per ogni giorno */}
            {days.map((d) => (
              <div key={d} style={{ display: "contents" }}>
                {/* prima colonna: giorno */}
                <div style={boardDayCell}>
                  <div>{formatDate(d)}</div>
                  <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>
                    {d}
                  </div>
                </div>
                {/* celle per ogni assignee */}
                {visibleAssignees.map((ass) => {
                  const list = tasksByAssigneeAndDay[ass]?.[d] || [];
                  const isQuick =
                    quickCreateTarget &&
                    quickCreateTarget.date === d &&
                    quickCreateTarget.assignee === ass;

                  return (
                    <div key={ass + d} style={boardCell}>
                      {list.length === 0 && !isQuick && (
                        <span
                          style={{
                            fontSize: 10,
                            color: "var(--color-text-subtle)",
                            display: "block",
                            marginBottom: 4,
                          }}
                        >
                          Nessun task
                        </span>
                      )}

                      {list.map((t) => {
                        const unit = t.unit_id ? unitMap[t.unit_id] : null;
                        const isSaving = savingTaskId === t.id;
                        return (
                          <div key={t.id} style={miniTaskCard(t.status)}>
                            <div style={infoRow}>
                              <span style={{ fontSize: 11, fontWeight: 500 }}>
                                {t.time || "—"}
                              </span>
                              <span style={tagType(t.task_type)}>
                                {getTaskLabel(t.task_type)}
                              </span>
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--color-text-muted)",
                              }}
                            >
                              {unit
                                ? unit.name
                                : t.unit_id
                                ? `Unit #${t.unit_id}`
                                : "Senza unità"}
                            </div>
                            {t.notes && (
                              <div
                                style={{
                                  fontSize: 10,
                                  color: "var(--color-text-muted)",
                                  marginTop: 2,
                                }}
                              >
                                {t.notes}
                              </div>
                            )}

                            {/* select assegnatario */}
                            <div style={{ marginTop: 4 }}>
                              <select
                                style={inputInline}
                                value={t.assignee_name || "Non assegnato"}
                                disabled
                                onChange={(e) =>
                                  onChangeAssignee(t, e.target.value)
                                }
                              >
                                {assigneeOptions.map((name) => (
                                  <option key={name} value={name}>
                                    {name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr auto",
                                gap: 4,
                                marginTop: 4,
                                alignItems: "center",
                              }}
                            >
                              <div>
                                <div
                                  style={{
                                    fontSize: 10,
                                    color: "var(--color-text-muted)",
                                    marginBottom: 2,
                                  }}
                                >
                                  Costo
                                </div>
                                <input
                                  type="number"
                                  step="0.01"
                                  disabled
                                  value={
                                    t.cost === null || t.cost === undefined
                                      ? ""
                                      : t.cost
                                  }
                                  onChange={(e) =>
                                    onChangeCost(t, e.target.value)
                                  }
                                  onBlur={() => onBlurCost(t)}
                                  style={inputInline}
                                />
                              </div>
                              <div>
                                <div
                                  style={{
                                    fontSize: 10,
                                    color: "var(--color-text-muted)",
                                    marginBottom: 2,
                                  }}
                                >
                                  Ore
                                </div>
                                <input
                                  type="number"
                                  step="0.25"
                                  disabled
                                  value={
                                    t.estimated_hours === null ||
                                    t.estimated_hours === undefined
                                      ? ""
                                      : t.estimated_hours
                                  }
                                  onChange={(e) =>
                                    onChangeHours(t, e.target.value)
                                  }
                                  onBlur={() => onBlurHours(t)}
                                  style={inputInline}
                                />
                              </div>
                              <button
                                type="button"
                                style={pillStatus(t.status)}
                                disabled
                                onClick={() => onToggleStatus(t)}
                              >
                                {isSaving
                                  ? "..."
                                  : t.status === "done"
                                  ? "Fatto"
                                  : "Da fare"}
                              </button>
                            </div>
                            <Button
                              variant="secondary"
                              size="sm"
                              style={{ marginTop: 4 }}
                              onClick={() => onEditTask(t)}
                            >
                              Modifica
                            </Button>
                          </div>
                        );
                      })}

                      {/* quick add */}
                      {isQuick ? (
                        <QuickCreateForm {...quick} />
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          style={{ marginTop: 4 }}
                          onClick={() => onOpenQuickCreate(d, ass)}
                        >
                          + Aggiungi task
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default StaffBoard;
