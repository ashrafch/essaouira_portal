import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Pencil, Power, RotateCcw, Trash2 } from "lucide-react";
import {
  getStaffMembers,
  createStaffMember,
  updateStaffMember,
  deactivateStaffMember,
} from "../services/api";
import { PageHeader, Button, Modal, useToast } from "../components/ui";

const COLOR_SWATCHES = ["#0f766e", "#2563eb", "#f97316", "#a855f7", "#dc2626", "#16a34a"];
const STAFF_ROLES = [
  { value: "housekeeping", label: "Housekeeping (Pulizie)" },
  { value: "kitchen", label: "Cucina / Colazioni" },
  { value: "reception_day", label: "Reception (Giorno)" },
  { value: "reception_night", label: "Reception (Notte)" },
  { value: "manager", label: "Manager" },
];

function roleLabel(roleValue) {
  if (!roleValue) return "-";
  const found = STAFF_ROLES.find((r) => r.value === roleValue);
  return found ? found.label : roleValue;
}

function sortMembers(list) {
  return [...list].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function StaffDirectory() {
  const toast = useToast();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [hourlyCost, setHourlyCost] = useState("");
  const [colorHex, setColorHex] = useState("");
  const [isActive, setIsActive] = useState(true);

  async function loadMembers({ silent = false } = {}) {
    if (!silent) setLoading(true);
    setError("");
    try {
      const params = !showInactive ? { active_only: "true" } : {};
      const data = await getStaffMembers(params);
      setMembers(sortMembers(data || []));
    } catch (err) {
      setError(err.message || "Errore caricando lo staff.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setRole("");
    setHourlyCost("");
    setColorHex("");
    setIsActive(true);
  }

  function openCreateModal() {
    resetForm();
    setIsModalOpen(true);
  }

  function startEdit(member) {
    setEditingId(member.id);
    setName(member.name || "");
    setRole(member.role || "");
    setHourlyCost(member.hourly_cost == null ? "" : String(member.hourly_cost));
    setColorHex(member.color_hex || "");
    setIsActive(Boolean(member.is_active));
    setIsModalOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Il nome è obbligatorio.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        role: role || null,
        color_hex: colorHex || null,
        hourly_cost: hourlyCost === "" ? null : Number(hourlyCost),
        is_active: isActive,
      };

      if (editingId) {
        await updateStaffMember(editingId, payload);
      } else {
        await createStaffMember(payload);
      }
      await loadMembers({ silent: true });
      toast.success(
        editingId ? "Membro staff aggiornato." : "Nuovo membro staff creato."
      );
      resetForm();
      setIsModalOpen(false);
    } catch (err) {
      toast.error("Errore salvando membro staff: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(member) {
    try {
      await updateStaffMember(member.id, { is_active: !member.is_active });
      await loadMembers({ silent: true });
      toast.success(
        member.is_active
          ? "Membro disattivato con successo."
          : "Membro riattivato con successo."
      );
    } catch (err) {
      toast.error("Errore aggiornando stato: " + err.message);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Eliminare definitivamente questo membro?")) return;
    try {
      await deactivateStaffMember(id);
      await loadMembers({ silent: true });
      toast.success("Membro eliminato.");
    } catch (err) {
      toast.error("Errore eliminando membro: " + err.message);
    }
  }

  const activeCount = useMemo(() => members.filter((m) => m.is_active).length, [members]);
  const inactiveCount = members.length - activeCount;

  const card = {
    background: "var(--color-surface)",
    borderRadius: 14,
    padding: 14,
    boxShadow: "var(--shadow-sm)",
    border: "1px solid var(--color-border)",
  };

  const input = {
    borderRadius: 8,
    border: "1px solid var(--color-border-strong)",
    padding: "6px 8px",
    fontSize: 13,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader
        title="Anagrafica Staff"
        subtitle="Gestisci membri staff e stato attivo/disattivo. I disattivi non compaiono nei planner operativi."
        actions={
          <>
            <span style={{ fontSize: 12, color: "var(--color-success-strong)", background: "var(--color-success-soft)", border: "1px solid var(--color-success)", borderRadius: 999, padding: "6px 10px" }}>Attivi: {activeCount}</span>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)", background: "var(--color-surface-soft)", border: "1px solid var(--color-border)", borderRadius: 999, padding: "6px 10px" }}>Disattivi: {inactiveCount}</span>
          </>
        }
      />

      {error && <p style={{ color: "var(--color-danger)", fontSize: 12 }}>{error}</p>}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr" }}>
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 15 }}>Lista staff</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Button
                variant="primary"
                size="sm"
                icon={<Plus size={14} />}
                onClick={openCreateModal}
              >
                Nuovo membro
              </Button>
              <label style={{ fontSize: 12, color: "var(--color-text-muted)", display: "inline-flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                Mostra disattivi
              </label>
              <Button
                variant="secondary"
                size="sm"
                icon={<RefreshCw size={14} />}
                onClick={() => loadMembers()}
              >
                Aggiorna
              </Button>
            </div>
          </div>

          {loading ? (
            <p style={{ fontSize: 13 }}>Caricamento staff...</p>
          ) : members.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Nessun membro staff registrato.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)", padding: 6 }}>Nome</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)", padding: 6 }}>Ruolo</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)", padding: 6 }}>Costo/h</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)", padding: 6 }}>Stato</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)", padding: 6 }}>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td style={{ padding: 6, borderBottom: "1px solid var(--color-border)" }}>
                        <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          {m.color_hex ? <span style={{ width: 10, height: 10, borderRadius: 999, background: m.color_hex }} /> : null}
                          {m.name}
                        </div>
                      </td>
                      <td style={{ padding: 6, borderBottom: "1px solid var(--color-border)" }}>{roleLabel(m.role)}</td>
                      <td style={{ padding: 6, borderBottom: "1px solid var(--color-border)" }}>{m.hourly_cost != null ? `EUR ${Number(m.hourly_cost).toFixed(2)}` : "-"}</td>
                      <td style={{ padding: 6, borderBottom: "1px solid var(--color-border)" }}>
                        <span style={{ borderRadius: 999, padding: "2px 8px", fontSize: 11, background: m.is_active ? "var(--color-success-soft)" : "var(--color-surface-soft)", color: m.is_active ? "var(--color-success-strong)" : "var(--color-text-muted)" }}>
                          {m.is_active ? "Attivo" : "Disattivo"}
                        </span>
                      </td>
                      <td style={{ padding: 6, borderBottom: "1px solid var(--color-border)", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          <Button variant="secondary" size="sm" icon={<Pencil size={13} />} onClick={() => startEdit(m)}>Modifica</Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={m.is_active ? <Power size={13} /> : <RotateCcw size={13} />}
                            onClick={() => handleToggleActive(m)}
                          >
                            {m.is_active ? "Disattiva" : "Riattiva"}
                          </Button>
                          <Button variant="danger" size="sm" icon={<Trash2 size={13} />} onClick={() => handleDelete(m.id)}>
                            Elimina
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={isModalOpen}
        title={editingId ? "Modifica membro staff" : "Nuovo membro staff"}
        onClose={() => {
          setIsModalOpen(false);
          resetForm();
        }}
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => { setIsModalOpen(false); resetForm(); }}
            >
              Annulla
            </Button>
            <Button type="submit" form="staff-member-form" loading={saving}>
              {editingId ? "Salva modifiche" : "Aggiungi membro"}
            </Button>
          </>
        }
      >
        <form id="staff-member-form" onSubmit={handleSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label>Nome completo</label>
            <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Fatima El A." />

            <label>Ruolo</label>
            <select style={input} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">Nessun ruolo</option>
              {STAFF_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>

            <label>Costo orario (EUR)</label>
            <input style={input} type="number" min="0" step="0.5" value={hourlyCost} onChange={(e) => setHourlyCost(e.target.value)} />

            <label>Colore</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColorHex(c)}
                  style={{ width: 20, height: 20, borderRadius: 999, border: colorHex === c ? "2px solid var(--color-primary)" : "1px solid var(--color-border-strong)", background: c, cursor: "pointer" }}
                />
              ))}
              <input style={{ ...input, maxWidth: 110 }} value={colorHex} onChange={(e) => setColorHex(e.target.value)} placeholder="#0f766e" />
            </div>

            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Attivo
            </label>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default StaffDirectory;
