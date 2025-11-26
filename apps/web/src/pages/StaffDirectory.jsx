import { useEffect, useState } from "react";
import {
  getStaffMembers,
  createStaffMember,
  updateStaffMember,
  deactivateStaffMember,
} from "../services/api";

function StaffDirectory() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showInactive, setShowInactive] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [colorHex, setColorHex] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getStaffMembers({
          include_inactive: showInactive,
        });
        setMembers(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [showInactive]);

  function resetForm() {
    setEditingId(null);
    setFullName("");
    setRole("");
    setEmail("");
    setPhone("");
    setColorHex("");
    setIsActive(true);
  }

  function startEdit(m) {
    setEditingId(m.id);
    setFullName(m.full_name);
    setRole(m.role || "");
    setEmail(m.email || "");
    setPhone(m.phone || "");
    setColorHex(m.color_hex || "");
    setIsActive(m.is_active);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!fullName.trim()) {
      alert("Il nome è obbligatorio");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        full_name: fullName.trim(),
        role: role || null,
        email: email || null,
        phone: phone || null,
        color_hex: colorHex || null,
        is_active: isActive,
      };
      if (editingId) {
        const updated = await updateStaffMember(editingId, payload);
        setMembers((prev) =>
          prev.map((m) => (m.id === updated.id ? updated : m))
        );
      } else {
        const created = await createStaffMember(payload);
        setMembers((prev) => [...prev, created]);
      }
      resetForm();
    } catch (err) {
      alert("Errore salvando membro staff: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id) {
    if (!window.confirm("Disattivare questo membro?")) return;
    try {
      await deactivateStaffMember(id);
      setMembers((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, is_active: false } : m
        )
      );
    } catch (err) {
      alert("Errore disattivando membro: " + err.message);
    }
  }

  const page = {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  };

  const card = {
    background: "white",
    borderRadius: 14,
    padding: 14,
    boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
    border: "1px solid #e5e7eb",
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
    borderRadius: 8,
    border: "1px solid #d1d5db",
    padding: "6px 8px",
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
    border: "1px solid #d1d5db",
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
    padding: "6px 4px",
    color: "#6b7280",
    fontSize: 11,
  };

  const td = {
    padding: "6px 4px",
    borderBottom: "1px solid #f3f4f6",
    verticalAlign: "top",
  };

  return (
    <div style={page}>
      <div>
        <h1 style={{ marginBottom: 4 }}>Anagrafica Staff</h1>
        <p style={{ fontSize: 13, color: "#6b7280" }}>
          Gestisci le persone che lavorano nella struttura. I nomi
          dovrebbero essere gli stessi che usi come <code>assignee</code>{" "}
          nei task.
        </p>
      </div>

      {error && (
        <p style={{ color: "red", fontSize: 12 }}>{error}</p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px, 320px) 1fr",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <div style={card}>
          <h2 style={{ fontSize: 14, marginBottom: 8 }}>
            {editingId ? "Modifica membro" : "Nuovo membro"}
          </h2>
          <form onSubmit={handleSubmit}>
            <div style={field}>
              <label style={label}>Nome completo</label>
              <input
                style={input}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Es. Fatima El A."
              />
            </div>
            <div style={field}>
              <label style={label}>Ruolo</label>
              <input
                style={input}
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Es. Pulizie, Manutenzione..."
              />
            </div>
            <div style={field}>
              <label style={label}>Email</label>
              <input
                style={input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div style={field}>
              <label style={label}>Telefono</label>
              <input
                style={input}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div style={field}>
              <label style={label}>
                Colore (es. #0f766e) – opzionale
              </label>
              <input
                style={input}
                value={colorHex}
                onChange={(e) => setColorHex(e.target.value)}
              />
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
              <button
                type="submit"
                style={buttonPrimary}
                disabled={saving}
              >
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

        <div style={card}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <h2 style={{ fontSize: 14 }}>Lista staff</h2>
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
                onChange={(e) =>
                  setShowInactive(e.target.checked)
                }
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
                    <th style={th}>Contatti</th>
                    <th style={th}>Stato</th>
                    <th style={th}>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td style={td}>
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
                                border:
                                  "1px solid rgba(0,0,0,0.15)",
                              }}
                            />
                          )}
                          {m.full_name}
                        </div>
                      </td>
                      <td style={td}>{m.role || "—"}</td>
                      <td style={td}>
                        <div style={{ fontSize: 11 }}>
                          {m.email && (
                            <div>Email: {m.email}</div>
                          )}
                          {m.phone && (
                            <div>Tel: {m.phone}</div>
                          )}
                          {!m.email && !m.phone && "—"}
                        </div>
                      </td>
                      <td style={td}>
                        <span
                          style={{
                            borderRadius: 999,
                            padding: "2px 8px",
                            fontSize: 11,
                            backgroundColor: m.is_active
                              ? "#dcfce7"
                              : "#f3f4f6",
                            color: m.is_active
                              ? "#166534"
                              : "#6b7280",
                          }}
                        >
                          {m.is_active ? "Attivo" : "Disattivo"}
                        </span>
                      </td>
                      <td style={td}>
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
                        {m.is_active && (
                          <button
                            type="button"
                            style={{
                              ...buttonSecondary,
                              padding: "4px 8px",
                              fontSize: 11,
                              borderColor: "#fecaca",
                              color: "#b91c1c",
                            }}
                            onClick={() => handleDeactivate(m.id)}
                          >
                            Disattiva
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
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
