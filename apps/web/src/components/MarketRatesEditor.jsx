import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, useToast } from "./ui";
import { getMarketRates, createMarketRate, deleteMarketRate } from "../services/api";

const EMPTY = {
  label: "",
  nightly_rate: "",
  start_date: "",
  end_date: "",
  unit_id: "",
};

/**
 * Manual comp-set: reference market nightly rates by period (portfolio-wide or
 * per unit). Feeds the out-of-band pricing alert — it does not drive prices.
 */
export default function MarketRatesEditor({ units = [] }) {
  const toast = useToast();
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRates((await getMarketRates()) || []);
    } catch (err) {
      toast.error("Errore caricando il comp-set: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function add() {
    if (!form.label || !form.nightly_rate || !form.start_date || !form.end_date) {
      toast.info("Compila etichetta, tariffa e intervallo date.");
      return;
    }
    setSaving(true);
    try {
      await createMarketRate({
        label: form.label,
        nightly_rate: Number(form.nightly_rate),
        start_date: form.start_date,
        end_date: form.end_date,
        unit_id: form.unit_id === "" ? null : Number(form.unit_id),
      });
      toast.success("Tariffa di mercato aggiunta.");
      setForm(EMPTY);
      await reload();
    } catch (err) {
      toast.error("Errore: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    try {
      await deleteMarketRate(id);
      toast.success("Tariffa di mercato rimossa.");
      await reload();
    } catch (err) {
      toast.error("Errore: " + err.message);
    }
  }

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
    background: "var(--color-surface)",
    color: "var(--color-text)",
    width: "100%",
  };
  const th = {
    textAlign: "left",
    borderBottom: "1px solid var(--color-border)",
    padding: "6px 6px",
    color: "var(--color-text-muted)",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  };
  const td = {
    padding: "5px 6px",
    borderBottom: "1px solid var(--color-border)",
    verticalAlign: "middle",
    fontSize: 13,
  };
  const unitName = (id) =>
    id == null ? "Tutte le unità" : units.find((u) => u.id === id)?.name || `#${id}`;

  return (
    <div style={card}>
      <h2 style={{ fontSize: 14, margin: "0 0 2px" }}>Comp-set (tariffe di mercato)</h2>
      <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "0 0 10px" }}>
        Tariffe di riferimento della zona, inserite a mano. Alimentano l'alert
        “prezzo fuori mercato”; non modificano i prezzi automaticamente.
      </p>

      {loading ? (
        <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Caricamento…</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Riferimento</th>
                <th style={th}>Tariffa/notte</th>
                <th style={th}>Dal</th>
                <th style={th}>Al</th>
                <th style={th}>Unità</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id}>
                  <td style={td}>{r.label}</td>
                  <td style={td}>{Number(r.nightly_rate).toFixed(0)}</td>
                  <td style={td}>{r.start_date}</td>
                  <td style={td}>{r.end_date}</td>
                  <td style={td}>{unitName(r.unit_id)}</td>
                  <td style={td}>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={14} />}
                      onClick={() => remove(r.id)}
                      aria-label="Rimuovi tariffa di mercato"
                    />
                  </td>
                </tr>
              ))}
              {rates.length === 0 && (
                <tr>
                  <td style={{ ...td, color: "var(--color-text-muted)" }} colSpan={6}>
                    Nessuna tariffa di mercato inserita.
                  </td>
                </tr>
              )}
              <tr>
                <td style={td}>
                  <input
                    style={input}
                    placeholder="Villa comparabile"
                    value={form.label}
                    onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                  />
                </td>
                <td style={td}>
                  <input
                    type="number"
                    step="1"
                    style={input}
                    placeholder="200"
                    value={form.nightly_rate}
                    onChange={(e) => setForm((p) => ({ ...p, nightly_rate: e.target.value }))}
                  />
                </td>
                <td style={td}>
                  <input
                    type="date"
                    style={input}
                    value={form.start_date}
                    onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
                  />
                </td>
                <td style={td}>
                  <input
                    type="date"
                    style={input}
                    value={form.end_date}
                    onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
                  />
                </td>
                <td style={td}>
                  <select
                    style={input}
                    value={form.unit_id}
                    onChange={(e) => setForm((p) => ({ ...p, unit_id: e.target.value }))}
                  >
                    <option value="">Tutte</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={td}>
                  <Button
                    size="sm"
                    icon={<Plus size={14} />}
                    onClick={add}
                    loading={saving}
                    aria-label="Aggiungi tariffa di mercato"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
