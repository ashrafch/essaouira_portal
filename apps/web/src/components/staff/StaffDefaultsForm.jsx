import { Button } from "../ui";
import { card, sectionTitle, field, label, input } from "./staffStyles";

/**
 * Staff defaults form (default assignee/cost/hours/currency used when the
 * system auto-creates tasks). Parent owns state, save handler and RBAC flag.
 */
function StaffDefaultsForm({
  defaultsLoading,
  onSubmit,
  defAssignee,
  setDefAssignee,
  defCost,
  setDefCost,
  defHours,
  setDefHours,
  defCurrency,
  setDefCurrency,
  defaultsSaving,
  canManageDefaults,
  defaultsMessage,
}) {
  return (
    <div style={card}>
      <div style={sectionTitle}>Impostazioni staff & default</div>
      <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 8 }}>
        Questi valori vengono usati quando il sistema crea automaticamente task
        (es. pulizie al check-out).
      </p>
      {defaultsLoading ? (
        <p style={{ fontSize: 12 }}>Caricamento impostazioni...</p>
      ) : (
        <form onSubmit={onSubmit}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            <div style={field}>
              <label style={label}>Operatore di default</label>
              <input
                style={input}
                value={defAssignee}
                onChange={(e) => setDefAssignee(e.target.value)}
                placeholder="Es. Operatore 1"
              />
            </div>
            <div style={field}>
              <label style={label}>Costo base (€)</label>
              <input
                style={input}
                type="number"
                min="0"
                step="0.5"
                value={defCost}
                onChange={(e) => setDefCost(e.target.value)}
              />
            </div>
            <div style={field}>
              <label style={label}>Ore stimate per task</label>
              <input
                style={input}
                type="number"
                min="0"
                step="0.25"
                value={defHours}
                onChange={(e) => setDefHours(e.target.value)}
              />
            </div>
            <div style={field}>
              <label style={label}>Valuta</label>
              <input
                style={input}
                value={defCurrency}
                maxLength={3}
                onChange={(e) => setDefCurrency(e.target.value)}
              />
            </div>
          </div>
          <Button
            type="submit"
            variant="primary"
            style={{ marginTop: 8 }}
            disabled={defaultsSaving || !canManageDefaults}
          >
            {defaultsSaving
              ? "Salvataggio..."
              : "Salva impostazioni automatiche"}
          </Button>
          {!canManageDefaults && (
            <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 6 }}>
              Ruolo in sola operativita': puoi leggere i default ma non
              modificarli.
            </p>
          )}
          {defaultsMessage && (
            <p
              style={{
                fontSize: 11,
                color: "var(--color-text-muted)",
                marginTop: 4,
              }}
            >
              {defaultsMessage}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

export default StaffDefaultsForm;
