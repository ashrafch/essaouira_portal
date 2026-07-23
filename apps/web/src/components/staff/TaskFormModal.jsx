import { Button } from "../ui";
import { card, field, label, input, select, textarea } from "./staffStyles";

/**
 * Detailed create/edit task modal (fixed, centered). Kept mounted and toggled
 * via `display` so field state survives close/reopen — same as the original.
 * Parent owns all form state, the submit handler and close behavior.
 */
function TaskFormModal({
  isOpen,
  formMode,
  editingId,
  onSubmit,
  onClose,
  date,
  setDate,
  taskType,
  setTaskType,
  assigneeName,
  setAssigneeName,
  unitId,
  setUnitId,
  units,
  estimatedHours,
  setEstimatedHours,
  status,
  setStatus,
  cost,
  setCost,
  currency,
  setCurrency,
  notes,
  setNotes,
  saving,
}) {
  return (
    <div
      style={{
        ...card,
        display: isOpen ? "block" : "none",
        position: "fixed",
        zIndex: 1200,
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: "min(860px, calc(100vw - 24px))",
        maxHeight: "90vh",
        overflowY: "auto",
      }}
    >
      <h2 style={{ fontSize: 14, marginBottom: 10 }}>
        {formMode === "create"
          ? "Nuovo task staff (dettagliato)"
          : `Modifica task #${editingId}`}
      </h2>

      <form onSubmit={onSubmit}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
          }}
        >
          <div style={field}>
            <label style={label}>Data</label>
            <input
              type="date"
              style={input}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div style={field}>
            <label style={label}>Tipo task</label>
            <select
              style={select}
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
            >
              <option value="cleaning">Pulizie</option>
              <option value="checkin">Check-in</option>
              <option value="checkout">Check-out</option>
              <option value="breakfast">Colazione</option>
              <option value="maintenance">Manutenzione</option>
              <option value="other">Altro</option>
            </select>
          </div>

          <div style={field}>
            <label style={label}>Assegnato a</label>
            <input
              style={input}
              value={assigneeName}
              onChange={(e) => setAssigneeName(e.target.value)}
              placeholder="Nome dello staff"
            />
          </div>

          <div style={field}>
            <label style={label}>Appartamento (opzionale)</label>
            <select
              style={select}
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
            >
              <option value="">Nessuno</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div style={field}>
            <label style={label}>Ore stimate</label>
            <input
              style={input}
              type="number"
              min="0"
              step="0.25"
              value={estimatedHours}
              onChange={(e) => setEstimatedHours(e.target.value)}
              placeholder="es. 1.5"
            />
          </div>

          <div style={field}>
            <label style={label}>Stato</label>
            <select
              style={select}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="planned">Planned</option>
              <option value="in_progress">In corso</option>
              <option value="done">Completato</option>
              <option value="cancelled">Annullato</option>
            </select>
          </div>

          <div style={field}>
            <label style={label}>Costo stimato</label>
            <input
              style={input}
              type="number"
              min="0"
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="es. 20"
            />
          </div>

          <div style={field}>
            <label style={label}>Valuta</label>
            <select
              style={select}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="EUR">EUR</option>
              <option value="MAD">MAD</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        <div style={field}>
          <label style={label}>Note interne</label>
          <textarea
            style={textarea}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Note per lo staff (es. orario preferito, richieste speciali...)"
          />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving
              ? "Salvataggio..."
              : formMode === "create"
              ? "Crea task"
              : "Salva modifiche"}
          </Button>
          {formMode === "edit" && (
            <Button variant="secondary" onClick={onClose}>
              Annulla modifica
            </Button>
          )}
          {formMode === "create" && (
            <Button variant="secondary" onClick={onClose}>
              Chiudi
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

export default TaskFormModal;
