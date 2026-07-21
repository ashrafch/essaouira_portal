import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Save, Sparkles } from "lucide-react";
import { Button, useToast } from "./ui";
import {
  getRateCalendar,
  upsertRateCalendar,
  applyRevenueRecommendations,
} from "../services/api";
import { MONTH_LABELS, formatISO } from "../utils/dateUtils";

const WEEKDAY_SHORT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

const SOURCE_LABEL = { base: "base", manual: "manuale", reco: "consiglio", rule: "regola" };

function sourceColor(source) {
  if (source === "manual") return "var(--color-accent-strong)";
  if (source === "reco") return "var(--color-info-strong)";
  return "var(--color-text-subtle)";
}

/**
 * Manual rate-calendar editor for a single unit + month.
 * Lets the owner set per-day price and minimum stay, and one-click apply the
 * revenue engine's recommendations (which skip manual overrides).
 */
export default function RateCalendarEditor({ units = [] }) {
  const toast = useToast();
  const today = new Date();

  const [unitId, setUnitId] = useState(units[0]?.id ?? null);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [days, setDays] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (unitId == null && units.length > 0) setUnitId(units[0].id);
  }, [units, unitId]);

  const currency = useMemo(() => {
    const u = units.find((x) => x.id === unitId);
    return u?.currency || "EUR";
  }, [units, unitId]);

  const reload = useCallback(async () => {
    if (unitId == null) return;
    setLoading(true);
    try {
      const from = formatISO(new Date(year, month, 1));
      const to = formatISO(new Date(year, month + 1, 1));
      const res = await getRateCalendar(unitId, { from_date: from, to_date: to });
      const list = res.days || [];
      setDays(list);
      const d = {};
      for (const day of list) {
        d[day.date] = {
          price: day.price == null ? "" : String(day.price),
          min_stay: day.min_stay == null ? "" : String(day.min_stay),
        };
      }
      setDrafts(d);
    } catch (err) {
      toast.error("Errore caricando il calendario tariffe: " + err.message);
      setDays([]);
      setDrafts({});
    } finally {
      setLoading(false);
    }
  }, [unitId, year, month, toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  function prevMonth() {
    const c = new Date(year, month, 1);
    const p = new Date(c.getFullYear(), c.getMonth() - 1, 1);
    setYear(p.getFullYear());
    setMonth(p.getMonth());
  }
  function nextMonth() {
    const c = new Date(year, month, 1);
    const n = new Date(c.getFullYear(), c.getMonth() + 1, 1);
    setYear(n.getFullYear());
    setMonth(n.getMonth());
  }

  function setDraft(date, fieldKey, value) {
    setDrafts((prev) => ({ ...prev, [date]: { ...prev[date], [fieldKey]: value } }));
  }

  function changedEntries() {
    const entries = [];
    for (const day of days) {
      const dr = drafts[day.date] || {};
      const priceStr = dr.price ?? "";
      const minStr = dr.min_stay ?? "";
      if (priceStr === "") continue; // a price is required to store a day
      const origPrice = day.price == null ? "" : String(day.price);
      const origMin = day.min_stay == null ? "" : String(day.min_stay);
      if (priceStr !== origPrice || minStr !== origMin) {
        entries.push({
          date: day.date,
          price: Number(priceStr),
          min_stay: minStr === "" ? null : Number(minStr),
        });
      }
    }
    return entries;
  }

  async function handleSave() {
    const entries = changedEntries();
    if (entries.length === 0) {
      toast.info("Nessuna modifica da salvare.");
      return;
    }
    setSaving(true);
    try {
      await upsertRateCalendar(unitId, entries);
      toast.success(`Salvate ${entries.length} tariffe (override manuale).`);
      await reload();
    } catch (err) {
      toast.error("Errore salvataggio tariffe: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyReco() {
    if (unitId == null) return;
    setApplying(true);
    try {
      const from = formatISO(new Date(year, month, 1));
      const to = formatISO(new Date(year, month + 1, 1));
      const res = await applyRevenueRecommendations(unitId, from, to);
      toast.success(
        `Consigli applicati: ${res.applied} giorni` +
          (res.skipped_overrides
            ? `, ${res.skipped_overrides} override manuali mantenuti`
            : "")
      );
      await reload();
    } catch (err) {
      toast.error("Errore generazione consigli: " + err.message);
    } finally {
      setApplying(false);
    }
  }

  const card = {
    background: "var(--color-surface)",
    borderRadius: 14,
    padding: 14,
    boxShadow: "var(--shadow-sm)",
    border: "1px solid var(--color-border)",
  };
  const smallInput = {
    width: "100%",
    borderRadius: 8,
    border: "1px solid var(--color-border-strong)",
    padding: "5px 7px",
    fontSize: 13,
    background: "var(--color-surface)",
    color: "var(--color-text)",
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
  };

  return (
    <div style={card}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 8,
        }}
      >
        <div>
          <h2 style={{ fontSize: 14, margin: 0 }}>Calendario tariffe</h2>
          <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "2px 0 0" }}>
            Prezzo per notte e soggiorno minimo per giorno. I consigli automatici
            non sovrascrivono le tariffe modificate a mano.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <select
            value={unitId ?? ""}
            onChange={(e) => setUnitId(e.target.value ? Number(e.target.value) : null)}
            style={{ ...smallInput, width: "auto" }}
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Button
              variant="secondary"
              size="sm"
              icon={<ChevronLeft size={16} />}
              onClick={prevMonth}
              aria-label="Mese precedente"
            />
            <span style={{ fontWeight: 600, minWidth: 128, textAlign: "center", fontSize: 13 }}>
              {MONTH_LABELS[month]} {year}
            </span>
            <Button
              variant="secondary"
              size="sm"
              icon={<ChevronRight size={16} />}
              onClick={nextMonth}
              aria-label="Mese successivo"
            />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <Button
          variant="secondary"
          size="sm"
          icon={<Sparkles size={15} />}
          onClick={handleApplyReco}
          loading={applying}
          disabled={unitId == null}
        >
          Applica consigli
        </Button>
        <Button
          size="sm"
          icon={<Save size={15} />}
          onClick={handleSave}
          loading={saving}
          disabled={unitId == null}
        >
          Salva modifiche
        </Button>
      </div>

      {loading ? (
        <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Caricamento…</p>
      ) : units.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          Nessuna unità configurata.
        </p>
      ) : (
        <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={th}>Giorno</th>
                <th style={th}>Origine</th>
                <th style={{ ...th, width: 110 }}>Prezzo ({currency})</th>
                <th style={{ ...th, width: 90 }}>Min notti</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => {
                const [yy, mm, dd] = day.date.split("-").map(Number);
                const dObj = new Date(yy, mm - 1, dd);
                const isWeekend = dObj.getDay() === 0 || dObj.getDay() === 6;
                const dr = drafts[day.date] || { price: "", min_stay: "" };
                return (
                  <tr
                    key={day.date}
                    style={{
                      background: isWeekend ? "var(--color-surface-soft)" : "transparent",
                    }}
                  >
                    <td style={td}>
                      <span style={{ fontWeight: 600 }}>{dd}</span>{" "}
                      <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                        {WEEKDAY_SHORT[dObj.getDay()]}
                      </span>
                    </td>
                    <td style={{ ...td, color: sourceColor(day.price_source), fontSize: 12 }}>
                      {SOURCE_LABEL[day.price_source] || day.price_source}
                    </td>
                    <td style={td}>
                      <input
                        type="number"
                        step="1"
                        style={smallInput}
                        value={dr.price}
                        onChange={(e) => setDraft(day.date, "price", e.target.value)}
                        placeholder={
                          day.price == null ? "—" : String(Math.round(day.price))
                        }
                      />
                    </td>
                    <td style={td}>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        style={smallInput}
                        value={dr.min_stay}
                        onChange={(e) => setDraft(day.date, "min_stay", e.target.value)}
                        placeholder="—"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 11, color: "var(--color-text-subtle)", marginTop: 8 }}>
        Le tariffe salvate a mano diventano override (arancione) e restano fisse;
        “Applica consigli” ricalcola solo i giorni non bloccati, entro la banda
        min/max dell’unità.
      </p>
    </div>
  );
}
