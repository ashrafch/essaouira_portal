import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import { canEditOperations } from "../config/rbac";
import { readWorkflowContext } from "../routes/workflowContext";
import { loadSections } from "../services/loadSections";
import {
  getMaintenanceTickets,
  createMaintenanceTicket,
  updateMaintenanceTicket,
  deleteMaintenanceTicket,
  getUnits,
  getStaffMembers,
} from "../services/api";
import { PageHeader, Button, Modal } from "../components/ui";

const PRIORITY_COLORS = {
  low: "var(--color-success-soft)", // verde chiaro
  medium: "var(--color-warning-soft)", // giallo
  high: "var(--color-danger-soft)", // rosso chiaro
  urgent: "var(--color-danger)", // rosso scuro
};

const TYPE_LABELS = {
  repair: "Riparazione",
  improvement: "Miglioria",
  purchase: "Acquisto",
};

function Maintenance() {
  const context = readWorkflowContext(useLocation());
  const canEdit = canEditOperations();
  const [unitFilter, setUnitFilter] = useState(context.unitId);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setUnitFilter(context.unitId); }, [context.unitId]);
  const [tickets, setTickets] = useState([]);
  const [units, setUnits] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    unit_id: "",
    assigned_to_id: "",
    priority: "medium",
    ticket_type: "repair",
    cost: "",
    status: "todo",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, failed } = await loadSections({
        ticket: getMaintenanceTickets,
        unita: getUnits,
        personale: () => canEdit ? getStaffMembers({ active_only: true }) : [],
      });
      const { ticket: ts, unita: us, personale: ss } = data;
      setError(failed.length ? `Dati non disponibili: ${failed.join(", ")}.` : "");
      setTickets(ts || []);
      setUnits(us || []);
      setStaff(ss || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [canEdit]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Group tickets by status
  const columns = useMemo(() => {
    const cols = {
      todo: [],
      in_progress: [],
      done: [],
    };
    tickets.forEach((t) => {
      if (unitFilter && String(t.unit_id) !== unitFilter) return;
      if (cols[t.status]) cols[t.status].push(t);
    });
    return cols;
  }, [tickets, unitFilter]);

  function openModal(ticket = null) {
    if (!canEdit || busy || loading) return;
    if (ticket) {
      setEditingId(ticket.id);
      setFormData({
        title: ticket.title,
        description: ticket.description || "",
        unit_id: ticket.unit_id || "",
        assigned_to_id: ticket.assigned_to_id || "",
        priority: ticket.priority,
        ticket_type: ticket.ticket_type,
        cost: ticket.cost || "",
        status: ticket.status,
      });
    } else {
      setEditingId(null);
      setFormData({
        title: "",
        description: "",
        unit_id: unitFilter,
        assigned_to_id: "",
        priority: "medium",
        ticket_type: "repair",
        cost: "",
        status: "todo",
      });
    }
    setIsModalOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canEdit || busy) return;
    setBusy(true);
    const payload = {
      ...formData,
      unit_id: formData.unit_id ? Number(formData.unit_id) : null,
      assigned_to_id: formData.assigned_to_id ? Number(formData.assigned_to_id) : null,
      cost: formData.cost ? Number(formData.cost) : null,
    };

    try {
      if (editingId) {
        const updated = await updateMaintenanceTicket(editingId, payload);
        setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      } else {
        const created = await createMaintenanceTicket(payload);
        setTickets((prev) => [created, ...prev]);
      }
      setIsModalOpen(false);
    } catch (err) {
      setError("Errore salvataggio: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id) {
    if (!canEdit || busy) return;
    if (!window.confirm("Eliminare questo ticket?")) return;
    setBusy(true);
    try {
      await deleteMaintenanceTicket(id);
      setTickets((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError("Errore eliminazione: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function moveStatus(ticket, newStatus) {
    if (!canEdit || busy) return;
    setBusy(true);
    try {
      const updated = await updateMaintenanceTicket(ticket.id, { status: newStatus });
      setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      setError("Cambio stato non riuscito: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  const unitMap = useMemo(() => {
    return units.reduce((acc, u) => ({ ...acc, [u.id]: u.name }), {});
  }, [units]);

  const staffMap = useMemo(() => {
    return staff.reduce((acc, s) => ({ ...acc, [s.id]: s.name }), {});
  }, [staff]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 40px)" }}>
      <PageHeader
        title="Manutenzioni & Migliorie"
        subtitle="Gestisci guasti, acquisti e lavori da fare nella struttura."
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => openModal()} disabled={!canEdit || busy || loading || Boolean(error)}>
            Nuova Segnalazione
          </Button>
        }
      />

      {error && <p role="alert">{error} <button type="button" onClick={loadData} disabled={loading || busy}>Riprova</button></p>}
      {unitFilter && <div style={{ display: "flex", gap: 12 }}>
        <Link to={`/units/${unitFilter}/timeline`}>{unitMap[unitFilter] || `Unita #${unitFilter}`}</Link>
        <button type="button" onClick={() => setUnitFilter("")}>Tutte le manutenzioni</button>
      </div>}
      {loading && (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 12 }}>
          Caricamento ticket manutenzione...
        </p>
      )}

      {/* BOARD COLUMNS */}
      <div style={{ display: "flex", gap: 20, overflowX: "auto", paddingBottom: 20, flex: 1 }}>
        {Object.entries(columns).map(([status, items]) => (
          <div
            key={status}
            style={{
              minWidth: 300,
              width: 300,
              backgroundColor: "var(--color-surface-soft)",
              borderRadius: 12,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div
              style={{
                fontWeight: 700,
                textTransform: "uppercase",
                fontSize: 12,
                color: "var(--color-text-muted)",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>
                {status === "todo"
                  ? "Da Fare"
                  : status === "in_progress"
                  ? "In Corso"
                  : "Completati"}
              </span>
              <span>{items.length}</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", flex: 1 }}>
              {items.map((t) => (
                <div
                  key={t.id}
                  style={{
                    backgroundColor: "var(--color-surface)",
                    padding: 12,
                    borderRadius: 8,
                    boxShadow: "var(--shadow-sm)",
                    borderLeft: `4px solid ${
                      t.priority === "urgent"
                        ? "var(--color-danger)"
                        : t.priority === "high"
                        ? "var(--color-danger)"
                        : t.priority === "medium"
                        ? "var(--color-warning)"
                        : "var(--color-success)"
                    }`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span
                      style={{
                        fontSize: 10,
                        textTransform: "uppercase",
                        fontWeight: 600,
                        color: "var(--color-text-muted)",
                      }}
                    >
                      {TYPE_LABELS[t.ticket_type] || t.ticket_type}
                    </span>
                    <div style={{ display: "flex", gap: 4 }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Pencil size={16} />}
                        onClick={() => openModal(t)}
                        aria-label="Modifica ticket"
                        disabled={!canEdit || busy || loading || Boolean(error)}
                      />
                      <Button
                        variant="danger"
                        size="sm"
                        icon={<Trash2 size={16} />}
                        onClick={() => handleDelete(t.id)}
                        aria-label="Elimina ticket"
                        disabled={!canEdit || busy}
                      />
                    </div>
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8 }}>
                    {t.unit_id ? `🏠 ${unitMap[t.unit_id]}` : "🏢 Struttura Generale"}
                  </div>
                  {t.assigned_to_id && (
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 2 }}>
                      👤 {staffMap[t.assigned_to_id]}
                    </div>
                  )}
                  {t.cost > 0 && (
                    <div style={{ fontSize: 11, color: "var(--color-success)", fontWeight: 500 }}>
                      💰 {t.cost} {t.currency}
                    </div>
                  )}

                  {/* Actions to move */}
                  <fieldset disabled={!canEdit || busy || loading} style={{ display: "flex", gap: 4, marginTop: 8, border: 0, padding: 0 }}>
                    {status !== "todo" && (
                      <Button variant="secondary" size="sm" onClick={() => moveStatus(t, "todo")}>
                        ← Da Fare
                      </Button>
                    )}
                    {status !== "in_progress" && (
                      <Button variant="secondary" size="sm" onClick={() => moveStatus(t, "in_progress")}>
                        In Corso
                      </Button>
                    )}
                    {status !== "done" && (
                      <Button variant="secondary" size="sm" onClick={() => moveStatus(t, "done")}>
                        Fatto →
                      </Button>
                    )}
                  </fieldset>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* MODAL FORM */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? "Modifica Ticket" : "Nuovo Ticket"}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Annulla
            </Button>
            <Button variant="primary" type="submit" form="maintenance-form" disabled={busy || !canEdit}>
              Salva
            </Button>
          </>
        }
      >
        <form
          id="maintenance-form"
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <input
            placeholder="Titolo (es. Lampadina fulminata)"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            style={{ padding: 8, borderRadius: 6, border: "1px solid var(--color-border-strong)" }}
            required
          />
          <textarea
            placeholder="Descrizione dettagliata..."
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            style={{ padding: 8, borderRadius: 6, border: "1px solid var(--color-border-strong)", minHeight: 60 }}
          />

          <div style={{ display: "flex", gap: 10 }}>
            <select
              value={formData.ticket_type}
              onChange={(e) => setFormData({ ...formData, ticket_type: e.target.value })}
              style={{ padding: 8, borderRadius: 6, border: "1px solid var(--color-border-strong)", flex: 1 }}
            >
              <option value="repair">Riparazione</option>
              <option value="improvement">Miglioria</option>
              <option value="purchase">Acquisto</option>
            </select>
            <select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              style={{ padding: 8, borderRadius: 6, border: "1px solid var(--color-border-strong)", flex: 1 }}
            >
              <option value="low">Bassa</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </select>
          </div>

          <select
            value={formData.unit_id}
            onChange={(e) => setFormData({ ...formData, unit_id: e.target.value })}
            style={{ padding: 8, borderRadius: 6, border: "1px solid var(--color-border-strong)" }}
          >
            <option value="">-- Struttura Generale --</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>

          <select
            value={formData.assigned_to_id}
            onChange={(e) => setFormData({ ...formData, assigned_to_id: e.target.value })}
            style={{ padding: 8, borderRadius: 6, border: "1px solid var(--color-border-strong)" }}
          >
            <option value="">-- Assegna a Staff --</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
            ))}
          </select>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label style={{ fontSize: 12 }}>Costo €:</label>
            <input
              type="number"
              step="0.01"
              value={formData.cost}
              onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
              style={{ padding: 8, borderRadius: 6, border: "1px solid var(--color-border-strong)", flex: 1 }}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default Maintenance;
