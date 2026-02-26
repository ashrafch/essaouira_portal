import { useEffect, useMemo, useState } from "react";
import useIsMobile from "../hooks/useIsMobile";
import AppModal from "../components/AppModal";
import PageInfoHelp from "../components/PageInfoHelp";
import {
  getMaintenanceTickets,
  createMaintenanceTicket,
  updateMaintenanceTicket,
  deleteMaintenanceTicket,
  getUnits,
  getStaffMembers,
} from "../services/api";

const TYPE_LABELS = {
  repair: "Riparazione",
  improvement: "Miglioria",
  purchase: "Acquisto",
};

const STATUS_COLUMNS = [
  { key: "todo", label: "Da fare" },
  { key: "in_progress", label: "In corso" },
  { key: "done", label: "Completati" },
];

function Maintenance() {
  const isMobile = useIsMobile(900);
  const [tickets, setTickets] = useState([]);
  const [units, setUnits] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const columns = useMemo(() => {
    const cols = { todo: [], in_progress: [], done: [] };
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
      alert(`Errore salvataggio: ${err.message}`);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Eliminare questo ticket?")) return;
    try {
      await deleteMaintenanceTicket(id);
      setTickets((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      alert(`Errore eliminazione: ${err.message}`);
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

  const unitMap = useMemo(() => units.reduce((acc, u) => ({ ...acc, [u.id]: u.name }), {}), [units]);
  const staffMap = useMemo(() => staff.reduce((acc, s) => ({ ...acc, [s.id]: s.name }), {}), [staff]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Manutenzioni e Migliorie</h1>
          <p style={{ color: "#6b7280", fontSize: 13, margin: "4px 0 0" }}>
            Gestisci guasti, acquisti e lavori della struttura.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <PageInfoHelp title="Come usare Manutenzioni">
            <p>Board Kanban per gestire ticket di guasto, acquisto e miglioria.</p>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
              <li>Crea ticket con priorita, tipo e assegnatario.</li>
              <li>Sposta stato tra `todo`, `in_progress`, `done`.</li>
              <li>Traccia costo per analisi budget manutenzione.</li>
            </ul>
          </PageInfoHelp>
          <button
            type="button"
            onClick={() => openModal()}
            style={{ backgroundColor: "#0f766e", color: "white", borderRadius: 8, padding: "8px 14px", fontWeight: 600 }}
          >
            + Nuovo ticket
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 0 }}>Caricamento ticket manutenzione...</p>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(250px, 1fr))",
          gap: 12,
        }}
      >
        {STATUS_COLUMNS.map((col) => {
          const items = columns[col.key] || [];
          return (
            <div
              key={col.key}
              style={{
                backgroundColor: "#f3f4f6",
                borderRadius: 12,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                minHeight: 220,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 12, color: "#4b5563", display: "flex", justifyContent: "space-between" }}>
                <span>{col.label}</span>
                <span>{items.length}</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {items.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      backgroundColor: "white",
                      padding: 12,
                      borderRadius: 8,
                      boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                      borderLeft: `4px solid ${
                        t.priority === "urgent"
                          ? "#dc2626"
                          : t.priority === "high"
                            ? "#f87171"
                            : t.priority === "medium"
                              ? "#fbbf24"
                              : "#34d399"
                      }`,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, gap: 8 }}>
                      <span style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 600, color: "#6b7280" }}>
                        {TYPE_LABELS[t.ticket_type] || t.ticket_type}
                      </span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" onClick={() => openModal(t)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, color: "#0f766e" }}>
                          Modifica
                        </button>
                        <button type="button" onClick={() => handleDelete(t.id)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, color: "#b91c1c" }}>
                          Elimina
                        </button>
                      </div>
                    </div>

                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{t.title}</div>
                    <div style={{ fontSize: 12, color: "#4b5563", marginBottom: 8 }}>
                      {t.unit_id ? `Unita: ${unitMap[t.unit_id]}` : "Struttura generale"}
                    </div>

                    {t.assigned_to_id ? (
                      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>
                        Staff: {staffMap[t.assigned_to_id]}
                      </div>
                    ) : null}

                    {t.cost > 0 ? (
                      <div style={{ fontSize: 11, color: "#059669", fontWeight: 500 }}>
                        Costo: {t.cost} {t.currency}
                      </div>
                    ) : null}

                    <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                      {col.key !== "todo" ? (
                        <button type="button" onClick={() => moveStatus(t, "todo")} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, border: "1px solid #ccc", background: "white" }}>
                          Da fare
                        </button>
                      ) : null}
                      {col.key !== "in_progress" ? (
                        <button type="button" onClick={() => moveStatus(t, "in_progress")} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, border: "1px solid #ccc", background: "white" }}>
                          In corso
                        </button>
                      ) : null}
                      {col.key !== "done" ? (
                        <button type="button" onClick={() => moveStatus(t, "done")} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, border: "1px solid #ccc", background: "white" }}>
                          Fatto
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <AppModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? "Modifica ticket" : "Nuovo ticket"}
        maxWidth={640}
      >
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          <input
            placeholder="Titolo (es. Lampadina fulminata)"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            required
          />

          <textarea
            placeholder="Descrizione dettagliata"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            style={{ minHeight: 76 }}
          />

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
            <select value={formData.ticket_type} onChange={(e) => setFormData({ ...formData, ticket_type: e.target.value })}>
              <option value="repair">Riparazione</option>
              <option value="improvement">Miglioria</option>
              <option value="purchase">Acquisto</option>
            </select>
            <select value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value })}>
              <option value="low">Bassa</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </select>
          </div>

          <select value={formData.unit_id} onChange={(e) => setFormData({ ...formData, unit_id: e.target.value })}>
            <option value="">Struttura generale</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>

          <select value={formData.assigned_to_id} onChange={(e) => setFormData({ ...formData, assigned_to_id: e.target.value })}>
            <option value="">Assegna a staff</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.role})
              </option>
            ))}
          </select>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "90px 1fr", gap: 10, alignItems: "center" }}>
            <label style={{ fontSize: 12 }}>Costo EUR</label>
            <input
              type="number"
              step="0.01"
              value={formData.cost}
              onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setIsModalOpen(false)} style={{ border: "1px solid #ccc", background: "white", color: "#111827" }}>
              Annulla
            </button>
            <button type="submit">Salva</button>
          </div>
        </form>
      </AppModal>
    </div>
  );
}

export default Maintenance;
