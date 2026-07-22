import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
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

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [ts, us, ss] = await Promise.all([
        getMaintenanceTickets(),
        getUnits(),
        getStaffMembers({ active_only: true }),
      ]);
      setTickets(ts || []);
      setUnits(us || []);
      setStaff(ss || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Group tickets by status
  const columns = useMemo(() => {
    const cols = {
      todo: [],
      in_progress: [],
      done: [],
    };
    tickets.forEach((t) => {
      if (cols[t.status]) cols[t.status].push(t);
    });
    return cols;
  }, [tickets]);

  function openModal(ticket = null) {
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
        unit_id: "",
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
      alert("Errore salvataggio: " + err.message);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Eliminare questo ticket?")) return;
    try {
      await deleteMaintenanceTicket(id);
      setTickets((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      alert("Errore eliminazione: " + err.message);
    }
  }

  async function moveStatus(ticket, newStatus) {
    try {
      const updated = await updateMaintenanceTicket(ticket.id, { status: newStatus });
      setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      console.error(err);
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
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => openModal()}>
            Nuova Segnalazione
          </Button>
        }
      />

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
                      />
                      <Button
                        variant="danger"
                        size="sm"
                        icon={<Trash2 size={16} />}
                        onClick={() => handleDelete(t.id)}
                        aria-label="Elimina ticket"
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
                  <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
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
                  </div>
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
            <Button variant="primary" type="submit" form="maintenance-form">
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
