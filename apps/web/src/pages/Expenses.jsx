import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  getCostItems,
  createCostItem,
  updateCostItem,
  deleteCostItem,
  getUnits,
} from "../services/api";
import { PageHeader, Button, Modal, useToast } from "../components/ui";

const EXPENSE_CATEGORIES = [
  "Utenze (Luce, Acqua, Gas)",
  "Internet & Telefono",
  "Affitto / Mutuo",
  "Tasse & Tributi",
  "Marketing & Pubblicita",
  "Software & Abbonamenti",
  "Spese Ufficio",
  "Materiali Consumo",
  "Assicurazione",
  "Altro",
];

function Expenses() {
  const toast = useToast();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [items, setItems] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [unitId, setUnitId] = useState("");

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const fromDate = new Date(year, month - 1, 1).toISOString().slice(0, 10);
      const nextMonth = new Date(year, month, 1);
      const toDate = nextMonth.toISOString().slice(0, 10);

      const [costs, uns] = await Promise.all([
        getCostItems({ from_date: fromDate, to_date: toDate }),
        getUnits(),
      ]);

      setItems(costs || []);
      setUnits(uns || []);
    } catch (err) {
      setError(err.message || "Errore caricamento spese");
    } finally {
      setLoading(false);
    }
  }

  const unitMap = useMemo(() => {
    return units.reduce((acc, u) => ({ ...acc, [u.id]: u.name }), {});
  }, [units]);

  const totalExpenses = useMemo(() => {
    return items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }, [items]);

  function resetForm() {
    setEditingId(null);
    setDate(new Date().toISOString().slice(0, 10));
    setCategory(EXPENSE_CATEGORIES[0]);
    setDescription("");
    setAmount("");
    setCurrency("EUR");
    setUnitId("");
  }

  function openCreateModal() {
    resetForm();
    setIsModalOpen(true);
  }

  function editItem(item) {
    setEditingId(item.id);
    setDate(item.date);
    setCategory(item.category);
    setDescription(item.description || "");
    setAmount(item.amount);
    setCurrency(item.currency || "EUR");
    setUnitId(item.unit_id ? String(item.unit_id) : "");
    setIsModalOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!amount || !date) {
      toast.error("Inserisci data e importo.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        date,
        category,
        description,
        amount: Number(amount),
        currency,
        unit_id: unitId ? Number(unitId) : null,
      };

      if (editingId) {
        const updated = await updateCostItem(editingId, payload);
        setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
        toast.success("Spesa aggiornata con successo.");
      } else {
        const created = await createCostItem(payload);
        setItems((prev) => [...prev, created]);
        toast.success("Nuova spesa registrata.");
      }
      setIsModalOpen(false);
      resetForm();
    } catch (err) {
      toast.error("Errore salvataggio: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Eliminare questa spesa?")) return;
    try {
      await deleteCostItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (editingId === id) resetForm();
      toast.success("Spesa eliminata.");
    } catch (err) {
      toast.error("Errore eliminazione: " + err.message);
    }
  }

  const page = { display: "flex", flexDirection: "column", gap: 16 };
  const card = { backgroundColor: "var(--color-surface)", borderRadius: 14, padding: 16, border: "1px solid var(--color-border)", boxShadow: "var(--shadow-sm)" };
  const title = { fontSize: 14, fontWeight: 600, color: "var(--color-text)", marginBottom: 4 };
  const inputStyle = { padding: "6px 10px", borderRadius: 8, border: "1px solid var(--color-border-strong)", fontSize: 13, width: "100%" };
  const table = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
  const th = { textAlign: "left", padding: "8px", borderBottom: "1px solid var(--color-border)", color: "var(--color-text-muted)", fontSize: 12 };
  const td = { padding: "8px", borderBottom: "1px solid var(--color-border)" };

  return (
    <div style={page}>
      <PageHeader
        title="Spese Generali"
        subtitle="Registra bollette, affitti, tasse e altre spese non legate allo staff."
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Periodo:</span>
            <select style={{ ...inputStyle, width: "auto" }} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{new Date(2000, i, 1).toLocaleDateString("it-IT", { month: "long" })}</option>
              ))}
            </select>
            <select style={{ ...inputStyle, width: "auto" }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        }
      />

      {error && <p style={{ color: "var(--color-danger)", fontSize: 12 }}>{error}</p>}
      {loading && <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Caricamento spese...</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <div style={card}>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Totale Spese ({new Date(year, month - 1, 1).toLocaleDateString("it-IT", { month: "long" })})</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-danger)", marginTop: 4 }}>
            EUR {totalExpenses.toFixed(2)}
          </div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Numero Voci</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text)", marginTop: 4 }}>
            {items.length}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16, alignItems: "flex-start" }}>
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <h2 style={{ ...title, marginBottom: 0 }}>Elenco Movimenti</h2>
            <Button variant="primary" icon={<Plus size={16} />} onClick={openCreateModal}>
              Nuova spesa
            </Button>
          </div>
          {items.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Nessuna spesa registrata per questo mese.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Data</th>
                    <th style={th}>Categoria / Dettagli</th>
                    <th style={th}>Riferimento</th>
                    <th style={th}>Importo</th>
                    <th style={th}>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td style={td}>{new Date(item.date).toLocaleDateString("it-IT")}</td>
                      <td style={td}>
                        <div style={{ fontWeight: 500 }}>{item.category}</div>
                        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{item.description}</div>
                      </td>
                      <td style={td}>
                        {item.unit_id ? <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 99, background: "var(--color-info-soft)", color: "var(--color-info-strong)", border: "1px solid var(--color-info)" }}>{unitMap[item.unit_id]}</span> : <span style={{ fontSize: 11, color: "var(--color-text-subtle)" }}>Generale</span>}
                      </td>
                      <td style={{ ...td, fontWeight: 600, color: "var(--color-danger)" }}>
                        - {Number(item.amount).toFixed(2)} {item.currency}
                      </td>
                      <td style={td}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <Button variant="secondary" size="sm" onClick={() => editItem(item)}>Modifica</Button>
                          <Button variant="danger" size="sm" onClick={() => handleDelete(item.id)}>Elimina</Button>
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
        title={editingId ? "Modifica spesa" : "Nuova spesa"}
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
            <Button variant="primary" type="submit" form="expenses-form" loading={saving}>
              {saving ? "Salvataggio..." : editingId ? "Aggiorna" : "Aggiungi Spesa"}
            </Button>
          </>
        }
      >
        <form id="expenses-form" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Data</label>
            <input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Categoria</label>
            <select style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Descrizione</label>
            <input
              style={inputStyle}
              placeholder="Es. Bolletta Enel Gennaio"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Importo</label>
              <input type="number" step="0.01" style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div style={{ width: 80 }}>
              <label style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Valuta</label>
              <input style={inputStyle} value={currency} onChange={(e) => setCurrency(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Unità (Opzionale)</label>
            <select style={inputStyle} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">-- Generale (Intera Struttura) --</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default Expenses;
