import { useEffect, useState } from "react";
import { getStaffTasks, getUnits, updateStaffTask } from "../services/api";

const pageWrapper = {
  display: "flex",
  flexDirection: "column",
  gap: 20,
};

const headerRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap",
};

const titleBlock = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const subtitleStyle = {
  fontSize: 13,
  color: "#6b7280",
};

const dateWrapper = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const dateLabel = {
  fontSize: 13,
  color: "#6b7280",
};

const dateInput = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 13,
};

const boardWrapper = {
  marginTop: 8,
  backgroundColor: "#f9fafb",
  borderRadius: 16,
  padding: 16,
  border: "1px solid #e5e7eb",
};

const boardInner = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 16,
};

const columnWrapper = {
  backgroundColor: "#f3f4f6",
  borderRadius: 14,
  padding: 14,
  border: "1px solid #e5e7eb",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const columnHeaderRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
};

const columnTitle = {
  fontSize: 14,
  fontWeight: 600,
  color: "#111827",
};

const columnCount = {
  fontSize: 11,
  color: "#9ca3af",
};

const taskList = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  marginTop: 4,
};

const taskCard = {
  backgroundColor: "#ffffff",
  borderRadius: 12,
  padding: 10,
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  cursor: "pointer",
};

const taskTitleRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const taskTitle = {
  fontSize: 13,
  fontWeight: 600,
  color: "#111827",
};

const taskMeta = {
  fontSize: 12,
  color: "#6b7280",
};

const statusPill = {
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
  backgroundColor: "#e0edff",
  color: "#1d4ed8",
  border: "1px solid #bfdbfe",
};

const metaRow = {
  display: "flex",
  gap: 6,
  marginTop: 4,
};

const metaChip = {
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 999,
  backgroundColor: "#f9fafb",
  border: "1px solid #e5e7eb",
  color: "#6b7280",
};

const notesStyle = {
  fontSize: 11,
  color: "#9ca3af",
  marginTop: 2,
};

const overlayStyle = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(15,23,42,0.25)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 50,
};

const modalStyle = {
  backgroundColor: "white",
  borderRadius: 16,
  padding: 20,
  width: "100%",
  maxWidth: 420,
  boxShadow: "0 10px 30px rgba(15,23,42,0.25)",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const modalRow = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const modalLabel = {
  fontSize: 12,
  color: "#6b7280",
};

const modalInput = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 13,
};

const modalTextArea = {
  ...modalInput,
  minHeight: 70,
  resize: "vertical",
};

const modalFooter = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 8,
};

const buttonBase = {
  padding: "6px 12px",
  borderRadius: 8,
  fontSize: 13,
  border: "1px solid transparent",
  cursor: "pointer",
};

const buttonGhost = {
  ...buttonBase,
  backgroundColor: "white",
  borderColor: "#d1d5db",
  color: "#374151",
};

const buttonPrimary = {
  ...buttonBase,
  backgroundColor: "#0f766e",
  color: "white",
};

const categories = [
  { key: "cleaning", label: "Pulizie" },
  { key: "checkin", label: "Check-in / Check-out" },
  { key: "breakfast", label: "Colazioni" },
  { key: "other", label: "Manutenzione / Altro" },
];

function StaffPlanner() {
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10);
  });

  const [tasks, setTasks] = useState([]);
  const [unitsById, setUnitsById] = useState({});
  const [loading, setLoading] = useState(false);

  const [editingTask, setEditingTask] = useState(null);
  const [editForm, setEditForm] = useState({
    assignee_name: "",
    status: "planned",
    estimated_hours: "",
    cost: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // carica unità
  useEffect(() => {
    async function loadUnits() {
      try {
        const units = await getUnits();
        const map = {};
        units.forEach((u) => {
          map[u.id] = u;
        });
        setUnitsById(map);
      } catch (err) {
        console.error("Errore caricamento units", err);
      }
    }
    loadUnits();
  }, []);

  // carica task del giorno
  useEffect(() => {
    async function loadTasks() {
      setLoading(true);
      try {
        const data = await getStaffTasks({ date: selectedDate });
        setTasks(data);
      } catch (err) {
        console.error("Errore caricamento staff tasks", err);
      } finally {
        setLoading(false);
      }
    }
    loadTasks();
  }, [selectedDate]);

  function formatUnit(task) {
    if (!task.unit_id) return "Senza unità";
    const unit = unitsById[task.unit_id];
    if (!unit) return `Unità #${task.unit_id}`;
    return `${unit.name} (#${unit.id})`;
  }

  function getColumnTasks(key) {
    switch (key) {
      case "cleaning":
        return tasks.filter((t) => t.task_type === "cleaning");
      case "checkin":
        return tasks.filter(
          (t) =>
            t.task_type === "checkin" ||
            t.task_type === "checkout" ||
            t.task_type === "check-in/out"
        );
      case "breakfast":
        return tasks.filter((t) => t.task_type === "breakfast");
      case "other":
      default:
        return tasks.filter(
          (t) =>
            !["cleaning", "checkin", "checkout", "check-in/out", "breakfast"].includes(
              t.task_type
            )
        );
    }
  }

  function openEdit(task) {
    setEditingTask(task);
    setSaveError("");
    setEditForm({
      assignee_name: task.assignee_name || "",
      status: task.status || "planned",
      estimated_hours:
        task.estimated_hours != null ? String(task.estimated_hours) : "",
      cost: task.cost != null ? String(task.cost) : "",
      notes: task.notes || "",
    });
  }

  function closeEdit() {
    if (saving) return;
    setEditingTask(null);
  }

  async function handleSave() {
    if (!editingTask) return;
    setSaving(true);
    setSaveError("");

    try {
      const payload = {
        date: editingTask.date,
        time: editingTask.time,
        task_type: editingTask.task_type,
        assignee_name: editForm.assignee_name || null,
        estimated_hours:
          editForm.estimated_hours !== ""
            ? Number(editForm.estimated_hours)
            : null,
        status: editForm.status || "planned",
        notes: editForm.notes || null,
        cost: editForm.cost !== "" ? Number(editForm.cost) : null,
        currency: editingTask.currency || "EUR",
        booking_id: editingTask.booking_id,
        unit_id: editingTask.unit_id,
      };

      const updated = await updateStaffTask(editingTask.id, payload);

      setTasks((prev) =>
        prev.map((t) => (t.id === updated.id ? updated : t))
      );

      setEditingTask(null);
    } catch (err) {
      console.error(err);
      setSaveError(err.message || "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={pageWrapper}>
      <div style={headerRow}>
        <div style={titleBlock}>
          <h1 style={{ margin: 0 }}>Planner Staff (giorno)</h1>
          <p style={subtitleStyle}>
            Vista operativa delle task di staff per un singolo giorno.
          </p>
        </div>

        <div style={dateWrapper}>
          <span style={dateLabel}>Seleziona giorno</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={dateInput}
          />
        </div>
      </div>

      <div style={boardWrapper}>
        <div style={boardInner}>
          {categories.map((col) => {
            const colTasks = getColumnTasks(col.key);
            return (
              <div key={col.key} style={columnWrapper}>
                <div style={columnHeaderRow}>
                  <span style={columnTitle}>{col.label}</span>
                  <span style={columnCount}>
                    {colTasks.length} task{colTasks.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div style={taskList}>
                  {loading && colTasks.length === 0 ? (
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>
                      Caricamento...
                    </span>
                  ) : colTasks.length === 0 ? (
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>
                      Nessuna task.
                    </span>
                  ) : (
                    colTasks.map((t) => (
                      <div
                        key={t.id}
                        style={taskCard}
                        onClick={() => openEdit(t)}
                      >
                        <div style={taskTitleRow}>
                          <div>
                            <div style={taskTitle}>
                              {t.assignee_name || "Staff non assegnato"}
                            </div>
                            <div style={taskMeta}>{formatUnit(t)}</div>
                          </div>
                          <span style={statusPill}>{t.status || "planned"}</span>
                        </div>

                        <div style={metaRow}>
                          {t.estimated_hours && (
                            <span style={metaChip}>
                              {t.estimated_hours} h
                            </span>
                          )}
                          {t.cost != null && (
                            <span style={metaChip}>
                              {t.cost} {t.currency || "EUR"}
                            </span>
                          )}
                        </div>

                        {t.notes && (
                          <div style={notesStyle}>
                            {t.notes.length > 80
                              ? t.notes.slice(0, 77) + "..."
                              : t.notes}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editingTask && (
        <div style={overlayStyle} onClick={closeEdit}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Modifica task staff</h2>
            <p style={{ ...subtitleStyle, margin: 0 }}>
              {editingTask.task_type === "cleaning"
                ? "Pulizia"
                : editingTask.task_type}
              {" · "}
              {formatUnit(editingTask)}
              {" · "}
              {editingTask.date}
            </p>

            <div style={modalRow}>
              <label style={modalLabel}>Operatore</label>
              <input
                style={modalInput}
                value={editForm.assignee_name}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, assignee_name: e.target.value }))
                }
                placeholder="Es. Operatore 1"
              />
            </div>

            <div style={modalRow}>
              <label style={modalLabel}>Stato</label>
              <select
                style={modalInput}
                value={editForm.status}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, status: e.target.value }))
                }
              >
                <option value="planned">Planned</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ ...modalRow, flex: 1 }}>
                <label style={modalLabel}>Ore stimate</label>
                <input
                  style={modalInput}
                  type="number"
                  min="0"
                  step="0.25"
                  value={editForm.estimated_hours}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      estimated_hours: e.target.value,
                    }))
                  }
                  placeholder="Es. 1"
                />
              </div>
              <div style={{ ...modalRow, flex: 1 }}>
                <label style={modalLabel}>Costo (€)</label>
                <input
                  style={modalInput}
                  type="number"
                  min="0"
                  step="0.5"
                  value={editForm.cost}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      cost: e.target.value,
                    }))
                  }
                  placeholder="Es. 5"
                />
              </div>
            </div>

            <div style={modalRow}>
              <label style={modalLabel}>Note</label>
              <textarea
                style={modalTextArea}
                value={editForm.notes}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Aggiungi note operative..."
              />
            </div>

            {saveError && (
              <div style={{ fontSize: 12, color: "red" }}>{saveError}</div>
            )}

            <div style={modalFooter}>
              <button
                type="button"
                style={buttonGhost}
                onClick={closeEdit}
                disabled={saving}
              >
                Annulla
              </button>
              <button
                type="button"
                style={buttonPrimary}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Salvataggio..." : "Salva modifiche"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StaffPlanner;
