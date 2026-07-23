import { Button } from "../ui";
import { formatCurrency } from "../../utils/format";
import { getTaskLabel } from "./staffHelpers";
import { card, table, th, td, pillStatus } from "./staffStyles";

/**
 * Full "agenda staff" table (sorted by date). Read-only rows plus edit/delete
 * actions. Parent owns the data, edit and delete callbacks.
 */
function StaffTaskTable({ filteredTasks, unitMap, onEditTask, onDelete }) {
  return (
    <div style={{ gridColumn: "1 / -1", ...card }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
          gap: 8,
        }}
      >
        <h2 style={{ fontSize: 14 }}>Agenda staff (lista completa)</h2>
      </div>

      {filteredTasks.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          Nessun task staff per i filtri selezionati.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Data</th>
                <th style={th}>Tipo</th>
                <th style={th}>Staff</th>
                <th style={th}>Unità</th>
                <th style={th}>Ore</th>
                <th style={th}>Costo</th>
                <th style={th}>Stato</th>
                <th style={th}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks
                .slice()
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((t) => {
                  const u = t.unit_id ? unitMap[t.unit_id] : null;
                  return (
                    <tr key={t.id}>
                      <td style={td}>
                        {t.date
                          ? new Date(t.date).toLocaleDateString("it-IT")
                          : "—"}
                      </td>
                      <td style={td}>{getTaskLabel(t.task_type)}</td>
                      <td style={td}>{t.assignee_name || "—"}</td>
                      <td style={td}>
                        {u
                          ? u.name
                          : t.unit_id
                          ? `Unit #${t.unit_id}`
                          : "—"}
                      </td>
                      <td style={td}>
                        {t.estimated_hours != null
                          ? t.estimated_hours.toFixed(1)
                          : "—"}
                      </td>
                      <td style={td}>
                        {t.cost != null
                          ? formatCurrency(t.cost, t.currency || "EUR", {
                              decimals: 2,
                            })
                          : "—"}
                      </td>
                      <td style={td}>
                        <span style={pillStatus(t.status)}>
                          {t.status === "planned"
                            ? "Planned"
                            : t.status === "in_progress"
                            ? "In corso"
                            : t.status === "done"
                            ? "Completato"
                            : t.status === "cancelled"
                            ? "Annullato"
                            : t.status}
                        </span>
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onEditTask(t)}
                        >
                          Modifica
                        </Button>{" "}
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => onDelete(t.id)}
                        >
                          Elimina
                        </Button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default StaffTaskTable;
