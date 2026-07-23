import { Button } from "../ui";
import { getRoleLabel } from "./staffHelpers";
import { quickForm, inputInline } from "./staffStyles";

/**
 * Inline "quick create" task form shown inside a board cell.
 * Parent owns all quick-* state and the create/close callbacks.
 */
function QuickCreateForm({
  quickType,
  setQuickType,
  quickUnitId,
  setQuickUnitId,
  units,
  quickRole,
  setQuickRole,
  staffRoles,
  quickAssignee,
  setQuickAssignee,
  quickAvailableAssignees,
  quickCost,
  setQuickCost,
  quickHours,
  setQuickHours,
  quickNotes,
  setQuickNotes,
  onSubmit,
  onClose,
  creatingTask,
}) {
  return (
    <form style={quickForm} onSubmit={onSubmit}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 500 }}>Nuovo task</span>
        <Button variant="secondary" size="sm" onClick={onClose}>
          ×
        </Button>
      </div>

      {/* tipo + unità */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        <select
          style={inputInline}
          value={quickType}
          onChange={(e) => setQuickType(e.target.value)}
        >
          <option value="cleaning">Pulizia</option>
          <option value="checkin">Check-in</option>
          <option value="checkout">Check-out</option>
          <option value="breakfast">Colazione</option>
          <option value="maintenance">Manutenzione</option>
          <option value="other">Altro</option>
        </select>
        <select
          style={inputInline}
          value={quickUnitId}
          onChange={(e) => setQuickUnitId(e.target.value)}
        >
          <option value="">Nessuna unità</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      {/* ruolo + assegnatario */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        <select
          style={inputInline}
          value={quickRole}
          onChange={(e) => {
            setQuickRole(e.target.value);
            setQuickAssignee("");
          }}
        >
          <option value="">Tutti i ruoli</option>
          {staffRoles.map((r) => (
            <option key={r} value={r}>
              {getRoleLabel(r)}
            </option>
          ))}
        </select>
        <select
          style={inputInline}
          value={quickAssignee}
          onChange={(e) => setQuickAssignee(e.target.value)}
        >
          <option value="">Nessun assegnatario</option>
          {quickAvailableAssignees.map((m) => (
            <option key={m.id} value={m.name}>
              {m.name}
              {m.role ? ` (${getRoleLabel(m.role)})` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* costi + ore */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        <input
          style={inputInline}
          type="number"
          step="0.01"
          placeholder="Costo"
          value={quickCost}
          onChange={(e) => setQuickCost(e.target.value)}
        />
        <input
          style={inputInline}
          type="number"
          step="0.25"
          placeholder="Ore"
          value={quickHours}
          onChange={(e) => setQuickHours(e.target.value)}
        />
      </div>

      {/* note */}
      <textarea
        style={{ ...inputInline, minHeight: 40, resize: "vertical" }}
        placeholder="Note (opzionale)"
        value={quickNotes}
        onChange={(e) => setQuickNotes(e.target.value)}
      />

      <Button
        type="submit"
        variant="primary"
        size="sm"
        style={{ alignSelf: "flex-start" }}
        disabled={creatingTask}
      >
        {creatingTask ? "Creazione..." : "Crea task"}
      </Button>
    </form>
  );
}

export default QuickCreateForm;
