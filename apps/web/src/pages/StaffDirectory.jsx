import { useEffect, useState } from "react";
import AppModal from "../components/AppModal";
import {
  getStaffMembers,
  createStaffMember,
  updateStaffMember,
  deactivateStaffMember, // usato come "elimina definitiva"
} from "../services/api";

const COLOR_SWATCHES = [
  "#0f766e", // verde owner / housekeeping
  "#2563eb", // blu manutenzione
  "#f97316", // arancio operations
  "#a855f7", // viola amministrazione
  "#dc2626", // rosso esterno / fornitore
  "#16a34a", // altro verde
];

// 👇 RUOLI DEFINITIVI (devono combaciare con l'enum lato backend)
const STAFF_ROLES = [
  { value: "housekeeping", label: "Housekeeping (Pulizie)" },
  { value: "kitchen", label: "Cucina / Colazioni" },
  { value: "reception_day", label: "Reception (Giorno)" },
  { value: "reception_night", label: "Reception (Notte)" },
  { value: "manager", label: "Amministratore / Manager" },
];

function getRoleLabel(roleValue) {
  if (!roleValue) return "—";
  const found = STAFF_ROLES.find((r) => r.value === roleValue);
  return found ? found.label : roleValue; // se in futuro aggiungi un ruolo nuovo
}

function StaffDirectory() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // false = mostra solo attivi (active_only=true)
  // true  = mostra anche disattivi (no filtro)
  const [showInactive, setShowInactive] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");           // 👈 ora è uno dei value di STAFF_ROLES
  const [hourlyCost, setHourlyCost] = useState("");
  const [colorHex, setColorHex] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = {};
        // se NON voglio vedere i disattivi → chiedo solo attivi
        if (!showInactive) {
          params.active_only = "true";
        }
        const data = await getStaffMembers(params);

        // ordino: prima attivi, poi disattivi, poi per nome
        data.sort((a, b) => {
          if (a.is_active !== b.is_active) {
            return a.is_active ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

        setMembers(data);
      } catch (err) {
        setError(err.message || "Errore caricando lo staff.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [showInactive]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setRole("");       // 👈 nessun ruolo selezionato
    setHourlyCost("");
    setColorHex("");
    setIsActive(true);
  }

  function openCreateModal() {
    resetForm();
    setIsFormModalOpen(true);
  }

  function startEdit(m) {
    setEditingId(m.id);
    setName(m.name || "");
    setRole(m.role || ""); // 👈 deve già essere uno dei value validi
    setHourlyCost(
      m.hourly_cost === null || m.hourly_cost === undefined
        ? ""
        : m.hourly_cost
    );
    setColorHex(m.color_hex || "");
    setIsActive(m.is_active);
    setIsFormModalOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      alert("Il nome è obbligatorio");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        role: role || null, // 👈 se non selezioni nulla, va a NULL lato backend
        color_hex: colorHex || null,
        hourly_cost:
          hourlyCost === "" || hourlyCost == null
            ? null
            : Number(hourlyCost),
        is_active: isActive,
      };

      if (editingId) {
        const updated = await updateStaffMember(editingId, payload);
        setMembers((prev) =>
          prev
            .map((m) => (m.id === updated.id ? updated : m))
            .sort((a, b) => {
              if (a.is_active !== b.is_active) {
                return a.is_active ? -1 : 1;
              }
              return a.name.localeCompare(b.name);
            })
        );
      } else {
        const created = await createStaffMember(payload);
        setMembers((prev) =>
          [...prev, created].sort((a, b) => {
            if (a.is_active !== b.is_active) {
              return a.is_active ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          })
        );
      }
      resetForm();
      setIsFormModalOpen(false);
    } catch (err) {
      alert("Errore salvando membro staff: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(member) {
    try {
      const updated = await updateStaffMember(member.id, {
        is_active: !member.is_active,
      });
      setMembers((prev) =>
        prev
          .map((m) => (m.id === updated.id ? updated : m))
          .sort((a, b) => {
            if (a.is_active !== b.is_active) {
              return a.is_active ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          })
      );
    } catch (err) {
      alert("Errore aggiornando stato: " + err.message);
    }
  }

  async function handleDelete(id) {
    if (
      !window.confirm(
        "Eliminare definitivamente questo membro? L'operazione non è reversibile."
      )
    )
      return;
    try {
      await deactivateStaffMember(id); // DELETE /staff-members/{id}
      setMembers((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      alert("Errore eliminando membro: " + err.message);
    }
  }

  const activeCount = members.filter((m) => m.is_active).length;
  const inactiveCount = members.length - activeCount;

  const page = {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  };

  const card = {
    background: "linear-gradient(180deg,#fff 0%,#f8fafc 100%)",
    borderRadius: 16,
    padding: 14,
    boxShadow: "0 8px 20px rgba(15,23,42,0.05)",
    border: "1px solid #e2e8f0",
  };

  const field = {
    marginBottom: 8,
    display: "flex",
    flexDirection: "column",
    gap: 3,
  };

  const label = {
    fontSize: 11,
    fontWeight: 500,
    color: "#374151",
  };

  const input = {
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    padding: "8px 10px",
    fontSize: 13,
  };

  const buttonPrimary = {
    borderRadius: 999,
    border: "none",
    padding: "7px 12px",
    fontSize: 12,
    fontWeight: 600,
    backgroundColor: "#0f766e",
    color: "white",
    cursor: "pointer",
  };

  const buttonSecondary = {
    borderRadius: 999,
    border: "1px solid #cbd5e1",
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 500,
    backgroundColor: "white",
    color: "#374151",
    cursor: "pointer",
  };

  const table = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  };

  const th = {
    textAlign: "left",
    borderBottom: "1px solid #e5e7eb",
    padding: "6px 6px",
    color: "#6b7280",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  };

  const tdBase = {
    padding: "6px 6px",
    borderBottom: "1px solid #f3f4f6",
    verticalAlign: "middle",
  };

  const colorSwatchBase = {
    width: 20,
    height: 20,
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.15)",
    cursor: "pointer",
  };

  return (
    <div style={page}>
      {/* Header + KPI */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ marginBottom: 4 }}>Anagrafica Staff</h1>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Gestisci i membri dello staff della struttura. I ruoli sono
            standardizzati (housekeeping, reception, cucina, manager) per gli
            automatismi sulle task.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontSize: 11,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={() => setIsInfoOpen(true)}
            aria-label="Info anagrafica staff"
            style={{
              width: 24,
              height: 24,
              borderRadius: 999,
              border: "1px solid #cbd5e1",
              background: "#fff",
              color: "#0f172a",
              fontWeight: 700,
              padding: 0,
              cursor: "pointer",
            }}
          >
            i
          </button>
          <div
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              backgroundColor: "#ecfdf5",
              color: "#166534",
              border: "1px solid #bbf7d0",
              minWidth: 80,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 10, textTransform: "uppercase" }}>
              Attivi
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{activeCount}</div>
          </div>
          <div
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              backgroundColor: "#f9fafb",
              color: "#6b7280",
              border: "1px solid #e2e8f0",
              minWidth: 80,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 10, textTransform: "uppercase" }}>
              Disattivi
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {inactiveCount}
            </div>
          </div>
          <button type="button" style={buttonPrimary} onClick={openCreateModal}>
            Nuovo membro
          </button>
        </div>
      </div>

      {error && <p style={{ color: "red", fontSize: 12 }}>{error}</p>}
      <AppModal
        open={isInfoOpen}
        onClose={() => setIsInfoOpen(false)}
        title="Come usare Anagrafica Staff"
        maxWidth={720}
      >
        <div style={{ display: "grid", gap: 10, fontSize: 13, color: "#334155" }}>
          <p>Anagrafica staff centralizza persone, ruolo, costo orario e stato attivo/disattivo.</p>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
            <li>Usa ruoli standard per automazioni su task e planner.</li>
            <li>Disattiva membri senza perdere lo storico operativo.</li>
            <li>Il costo orario entra nei calcoli Business/controllo costi.</li>
          </ul>
        </div>
      </AppModal>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <AppModal
          open={isFormModalOpen}
          onClose={() => setIsFormModalOpen(false)}
          title={editingId ? "Modifica membro" : "Nuovo membro"}
          maxWidth={720}
        >
        {/* FORM */}
        <div style={card}>
          <h2 style={{ fontSize: 14, marginBottom: 8 }}>
            {editingId ? "Modifica membro" : "Nuovo membro"}
          </h2>
          <form onSubmit={handleSubmit}>
            <div style={field}>
              <label style={label}>Nome completo</label>
              <input
                style={input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Es. Fatima El A."
              />
            </div>
            <div style={field}>
              <label style={label}>Ruolo</label>
              <select
                style={input}
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="">Nessun ruolo</option>
                {STAFF_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 11, color: "#6b7280" }}>
                Usa uno di questi ruoli per far funzionare bene gli automatismi
                (pulizie, check-in, colazioni, ecc.).
              </span>
            </div>
            <div style={field}>
              <label style={label}>Costo orario indicativo (€)</label>
              <input
                style={input}
                type="number"
                min="0"
                step="0.5"
                value={hourlyCost}
                onChange={(e) => setHourlyCost(e.target.value)}
                placeholder="Es. 5"
              />
              <span style={{ fontSize: 11, color: "#6b7280" }}>
                Usato solo per analisi interne (Business), opzionale.
              </span>
            </div>
            <div style={field}>
              <label style={label}>Colore identificativo</label>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                {COLOR_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColorHex(c)}
                    style={{
                      ...colorSwatchBase,
                      backgroundColor: c,
                      boxShadow:
                        colorHex === c ? "0 0 0 2px #0f766e" : "none",
                    }}
                  />
                ))}
                <input
                  style={{ ...input, maxWidth: 110, fontSize: 12 }}
                  value={colorHex}
                  onChange={(e) => setColorHex(e.target.value)}
                  placeholder="#0f766e"
                />
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 10,
                  color: "#9ca3af",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                }}
              >
                <span>Es. </span>
                <span>verde = housekeeping</span>
                <span>blu = manutenzione</span>
                <span>arancio = operations</span>
                <span>viola = amministrazione</span>
              </div>
            </div>
            <div style={field}>
              <label style={label}>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  style={{ marginRight: 6 }}
                />
                Attivo
              </label>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button type="submit" style={buttonPrimary} disabled={saving}>
                {saving
                  ? "Salvataggio..."
                  : editingId
                  ? "Salva modifiche"
                  : "Aggiungi membro"}
              </button>
              {editingId && (
                <button
                  type="button"
                  style={buttonSecondary}
                  onClick={resetForm}
                >
                  Annulla
                </button>
              )}
            </div>
          </form>
        </div>
        </AppModal>

        {/* LISTA */}
        <div style={card}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 6,
              alignItems: "center",
            }}
          >
            <div>
              <h2 style={{ fontSize: 14, marginBottom: 2 }}>Lista staff</h2>
              <p style={{ fontSize: 11, color: "#9ca3af" }}>
                I membri disattivi non compariranno nel planner staff.
              </p>
            </div>
            <label
              style={{
                fontSize: 11,
                color: "#6b7280",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Mostra anche disattivi
            </label>
          </div>

          {loading ? (
            <p style={{ fontSize: 13 }}>Caricamento staff...</p>
          ) : members.length === 0 ? (
            <p style={{ fontSize: 12, color: "#6b7280" }}>
              Nessun membro staff registrato.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Nome</th>
                    <th style={th}>Ruolo</th>
                    <th style={th}>Costo orario</th>
                    <th style={th}>Stato</th>
                    <th style={th}>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m, idx) => {
                    const rowStyle = {
                      backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f9fafb",
                    };
                    return (
                      <tr key={m.id} style={rowStyle}>
                        <td style={tdBase}>
                          <div
                            style={{
                              fontWeight: 500,
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            {m.color_hex && (
                              <span
                                style={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: "999px",
                                  backgroundColor: m.color_hex,
                                  border: "1px solid rgba(0,0,0,0.15)",
                                }}
                              />
                            )}
                            {m.name}
                          </div>
                        </td>
                        <td style={tdBase}>{getRoleLabel(m.role)}</td>
                        <td style={tdBase}>
                          {m.hourly_cost != null
                            ? `€ ${m.hourly_cost.toFixed(2)}`
                            : "—"}
                        </td>
                        <td style={tdBase}>
                          <span
                            style={{
                              borderRadius: 999,
                              padding: "2px 8px",
                              fontSize: 11,
                              backgroundColor: m.is_active
                                ? "#dcfce7"
                                : "#f3f4f6",
                              color: m.is_active ? "#166534" : "#6b7280",
                            }}
                          >
                            {m.is_active ? "Attivo" : "Disattivo"}
                          </span>
                        </td>
                        <td style={{ ...tdBase, whiteSpace: "nowrap" }}>
                          <button
                            type="button"
                            style={{
                              ...buttonSecondary,
                              padding: "4px 8px",
                              fontSize: 11,
                            }}
                            onClick={() => startEdit(m)}
                          >
                            Modifica
                          </button>{" "}
                          <button
                            type="button"
                            style={{
                              ...buttonSecondary,
                              padding: "4px 8px",
                              fontSize: 11,
                              borderColor: m.is_active
                                ? "#fee2e2"
                                : "#bfdbfe",
                              color: m.is_active ? "#b91c1c" : "#1d4ed8",
                            }}
                            onClick={() => handleToggleActive(m)}
                          >
                            {m.is_active ? "Disattiva" : "Riattiva"}
                          </button>{" "}
                          <button
                            type="button"
                            style={{
                              ...buttonSecondary,
                              padding: "4px 8px",
                              fontSize: 11,
                              borderColor: "#fecaca",
                              color: "#b91c1c",
                            }}
                            onClick={() => handleDelete(m.id)}
                          >
                            Elimina
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default StaffDirectory;

