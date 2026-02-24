import { useEffect, useMemo, useState } from "react";
import {
  getCostItems,
  createCostItem,
  updateCostItem,
  deleteCostItem,
  getUnits,
} from "../services/api";

const EXPENSE_CATEGORIES = [
  "Utenze (Luce, Acqua, Gas)",
  "Internet & Telefono",
  "Affitto / Mutuo",
  "Tasse & Tributi",
  "Marketing & Pubblicità",
  "Software & Abbonamenti",
  "Spese Ufficio",
  "Materiali Consumo",
  "Assicurazione",
  "Altro",
];

function Expenses() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [items, setItems] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Form state
  const [editingId, setEditingId] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [unitId, setUnitId] = useState(""); // Opzionale

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      // Calcoliamo start/end del mese per il filtro
      const fromDate = new Date(year, month - 1, 1).toISOString().slice(0, 10);
      // Per ottenere l'ultimo giorno, andiamo al primo del mese dopo e torniamo indietro (o usiamo la logica backend)
      // Qui passo direttamente il range al backend che se lo aspetta
      const nextMonth = new Date(year, month, 1);
      const toDate = nextMonth.toISOString().slice(0, 10);

      const [costs, uns] = await Promise.all([
        getCostItems({ from_date: fromDate, to_date: toDate }),
        getUnits(),
      ]);
      
      // Filtriamo per mostrare solo le spese manuali (quelle che hanno origin='manual' o null, 
      // anche se l'endpoint cost-items ritorna tutto, in questa pagina gestiamo l'inserimento manuale).
      // Se vuoi vedere TUTTO (anche i costi generati da staff), togli il filtro.
      // Per ora mostriamo tutto per avere un quadro completo, ma permettiamo di editare solo quelle manuali.
      setItems(costs);
      setUnits(uns);
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

  function editItem(item) {
    // Permetti modifica solo se è una spesa manuale (non generata da booking/staff)
    // Se il backend non salva 'origin' su CostItem manuali, assumiamo che possiamo modificarli tutti 
    // o aggiungiamo un controllo se necessario.
    setEditingId(item.id);
    setDate(item.date);
    setCategory(item.category);
    setDescription(item.description || "");
    setAmount(item.amount);
    setCurrency(item.currency);
    setUnitId(item.unit_id ? String(item.unit_id) : "");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!amount || !date) {
      alert("Inserisci data e importo.");
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
      } else {
        const created = await createCostItem(payload);
        setItems((prev) => [...prev, created]);
      }
      resetForm();
    } catch (err) {
      alert("Errore salvataggio: " + err.message);
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
    } catch (err) {
      alert("Errore eliminazione: " + err.message);
    }
  }

  // Styles
  const page = { display: "flex", flexDirection: "column", gap: 16 };
  const header = { display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 };
  const card = { backgroundColor: "white", borderRadius: 14, padding: 16, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" };
  const title = { fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 4 };
  const inputStyle = { padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, width: "100%" };
  const btnPrimary = { padding: "8px 16px", borderRadius: 99, border: "none", backgroundColor: "#0f766e", color: "white", cursor: "pointer", fontWeight: 500 };
  const btnSecondary = { padding: "6px 10px", borderRadius: 99, border: "1px solid #d1d5db", backgroundColor: "white", color: "#374151", cursor: "pointer", fontSize: 12 };
  const table = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
  const th = { textAlign: "left", padding: "8px", borderBottom: "1px solid #e5e7eb", color: "#6b7280", fontSize: 12 };
  const td = { padding: "8px", borderBottom: "1px solid #f3f4f6" };

  return (
    <div style={page}>
      <div style={header}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Spese Generali</h1>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Registra bollette, affitti, tasse e altre spese non legate allo staff.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#6b7280" }}>Periodo:</span>
          <select style={{...inputStyle, width: "auto"}} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{new Date(2000, i, 1).toLocaleDateString("it-IT", { month: "long" })}</option>
            ))}
          </select>
          <select style={{...inputStyle, width: "auto"}} value={year} onChange={(e) => setYear(Number(e.target.value))}>
             {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {error && <p style={{ color: "#b91c1c", fontSize: 12 }}>{error}</p>}
      {loading && <p style={{ fontSize: 13, color: "#6b7280" }}>Caricamento spese...</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <div style={card}>
          <div style={{ fontSize: 11, color: "#6b7280" }}>Totale Spese ({new Date(year, month-1, 1).toLocaleDateString("it-IT", { month: 'long' })})</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#dc2626", marginTop: 4 }}>
            € {totalExpenses.toFixed(2)}
          </div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 11, color: "#6b7280" }}>Numero Voci</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#111827", marginTop: 4 }}>
            {items.length}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) 2fr", gap: 16, alignItems: "flex-start" }}>
        {/* FORM */}
        <div style={card}>
          <h2 style={{ ...title, marginBottom: 12 }}>{editingId ? "Modifica Spesa" : "Nuova Spesa"}</h2>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: "#6b7280" }}>Data</label>
              <input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#6b7280" }}>Categoria</label>
              <select style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#6b7280" }}>Descrizione</label>
              <input 
                style={inputStyle} 
                placeholder="Es. Bolletta Enel Gennaio" 
                value={description} 
                onChange={(e) => setDescription(e.target.value)} 
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: "#6b7280" }}>Importo</label>
                <input type="number" step="0.01" style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </div>
              <div style={{ width: 80 }}>
                <label style={{ fontSize: 11, color: "#6b7280" }}>Valuta</label>
                <input style={inputStyle} value={currency} onChange={(e) => setCurrency(e.target.value)} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#6b7280" }}>Unità (Opzionale)</label>
              <select style={inputStyle} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">-- Generale (Intera Struttura) --</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button type="submit" style={{ ...btnPrimary, flex: 1 }} disabled={saving}>
                {saving ? "Salvataggio..." : editingId ? "Aggiorna" : "Aggiungi Spesa"}
              </button>
              {editingId && (
                <button type="button" style={btnSecondary} onClick={resetForm}>Annulla</button>
              )}
            </div>
          </form>
        </div>

        {/* LISTA */}
        <div style={card}>
          <h2 style={{ ...title, marginBottom: 12 }}>Elenco Movimenti</h2>
          {items.length === 0 ? (
            <p style={{ fontSize: 13, color: "#6b7280" }}>Nessuna spesa registrata per questo mese.</p>
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
                  {items.map(item => (
                    <tr key={item.id}>
                      <td style={td}>{new Date(item.date).toLocaleDateString("it-IT")}</td>
                      <td style={td}>
                        <div style={{ fontWeight: 500 }}>{item.category}</div>
                        <div style={{ fontSize: 11, color: "#6b7280" }}>{item.description}</div>
                      </td>
                      <td style={td}>
                        {item.unit_id ? <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 99, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>{unitMap[item.unit_id]}</span> : <span style={{ fontSize: 11, color: "#9ca3af" }}>Generale</span>}
                      </td>
                      <td style={{ ...td, fontWeight: 600, color: "#dc2626" }}>
                        - {Number(item.amount).toFixed(2)} {item.currency}
                      </td>
                      <td style={td}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button style={btnSecondary} onClick={() => editItem(item)}>✏️</button>
                          <button style={{ ...btnSecondary, borderColor: "#fecaca", color: "#dc2626" }} onClick={() => handleDelete(item.id)}>🗑️</button>
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
    </div>
  );
}

export default Expenses;
