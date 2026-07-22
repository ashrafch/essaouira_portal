import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, useToast } from "./ui";
import {
  getSeasons,
  createSeason,
  deleteSeason,
  getLeadTimeRules,
  createLeadTimeRule,
  deleteLeadTimeRule,
} from "../services/api";

const EMPTY_SEASON = {
  name: "",
  start_date: "",
  end_date: "",
  adjustment_percent: "",
  unit_id: "",
  priority: "0",
};
const EMPTY_RULE = { label: "", min_days: "0", max_days: "", adjustment_percent: "" };

/**
 * Manage seasonal profiles and lead-time rules that feed the recommendation
 * engine. Portfolio-wide by default; seasons can target a single unit.
 */
export default function RevenueRulesEditor({ units = [] }) {
  const toast = useToast();
  const [seasons, setSeasons] = useState([]);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seasonForm, setSeasonForm] = useState(EMPTY_SEASON);
  const [ruleForm, setRuleForm] = useState(EMPTY_RULE);
  const [savingSeason, setSavingSeason] = useState(false);
  const [savingRule, setSavingRule] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([getSeasons(), getLeadTimeRules()]);
      setSeasons(s || []);
      setRules(r || []);
    } catch (err) {
      toast.error("Errore caricando le regole: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  const num = (v, fallback = 0) => (v === "" || v == null ? fallback : Number(v));

  async function addSeason() {
    if (!seasonForm.name || !seasonForm.start_date || !seasonForm.end_date) {
      toast.info("Compila nome e intervallo di date.");
      return;
    }
    setSavingSeason(true);
    try {
      await createSeason({
        name: seasonForm.name,
        start_date: seasonForm.start_date,
        end_date: seasonForm.end_date,
        adjustment_percent: num(seasonForm.adjustment_percent),
        unit_id: seasonForm.unit_id === "" ? null : Number(seasonForm.unit_id),
        priority: num(seasonForm.priority),
      });
      toast.success("Stagione aggiunta.");
      setSeasonForm(EMPTY_SEASON);
      await reload();
    } catch (err) {
      toast.error("Errore salvataggio stagione: " + err.message);
    } finally {
      setSavingSeason(false);
    }
  }

  async function removeSeason(id) {
    try {
      await deleteSeason(id);
      toast.success("Stagione rimossa.");
      await reload();
    } catch (err) {
      toast.error("Errore: " + err.message);
    }
  }

  async function addRule() {
    if (!ruleForm.label) {
      toast.info("Inserisci un'etichetta per la regola.");
      return;
    }
    setSavingRule(true);
    try {
      await createLeadTimeRule({
        label: ruleForm.label,
        min_days: num(ruleForm.min_days),
        max_days: ruleForm.max_days === "" ? null : Number(ruleForm.max_days),
        adjustment_percent: num(ruleForm.adjustment_percent),
      });
      toast.success("Regola lead-time aggiunta.");
      setRuleForm(EMPTY_RULE);
      await reload();
    } catch (err) {
      toast.error("Errore salvataggio regola: " + err.message);
    } finally {
      setSavingRule(false);
    }
  }

  async function removeRule(id) {
    try {
      await deleteLeadTimeRule(id);
      toast.success("Regola rimossa.");
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* SEASONS */}
      <div style={card}>
        <h2 style={{ fontSize: 14, margin: "0 0 2px" }}>Profili stagionali</h2>
        <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "0 0 10px" }}>
          Intervalli di date che modificano in percentuale i prezzi consigliati (es.
          alta stagione +30%). Priorità più alta vince in caso di sovrapposizione.
        </p>

        {loading ? (
          <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Caricamento…</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Nome</th>
                  <th style={th}>Dal</th>
                  <th style={th}>Al</th>
                  <th style={th}>Agg. %</th>
                  <th style={th}>Unità</th>
                  <th style={th}>Prio.</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {seasons.map((s) => (
                  <tr key={s.id}>
                    <td style={td}>{s.name}</td>
                    <td style={td}>{s.start_date}</td>
                    <td style={td}>{s.end_date}</td>
                    <td style={td}>
                      {s.adjustment_percent > 0 ? "+" : ""}
                      {s.adjustment_percent}%
                    </td>
                    <td style={td}>{unitName(s.unit_id)}</td>
                    <td style={td}>{s.priority}</td>
                    <td style={td}>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 size={14} />}
                        onClick={() => removeSeason(s.id)}
                        aria-label="Rimuovi stagione"
                      />
                    </td>
                  </tr>
                ))}
                {seasons.length === 0 && (
                  <tr>
                    <td style={{ ...td, color: "var(--color-text-muted)" }} colSpan={7}>
                      Nessun profilo stagionale.
                    </td>
                  </tr>
                )}
                <tr>
                  <td style={td}>
                    <input
                      style={input}
                      placeholder="Alta stagione"
                      value={seasonForm.name}
                      onChange={(e) => setSeasonForm((p) => ({ ...p, name: e.target.value }))}
                    />
                  </td>
                  <td style={td}>
                    <input
                      type="date"
                      style={input}
                      value={seasonForm.start_date}
                      onChange={(e) =>
                        setSeasonForm((p) => ({ ...p, start_date: e.target.value }))
                      }
                    />
                  </td>
                  <td style={td}>
                    <input
                      type="date"
                      style={input}
                      value={seasonForm.end_date}
                      onChange={(e) =>
                        setSeasonForm((p) => ({ ...p, end_date: e.target.value }))
                      }
                    />
                  </td>
                  <td style={td}>
                    <input
                      type="number"
                      step="1"
                      style={input}
                      placeholder="30"
                      value={seasonForm.adjustment_percent}
                      onChange={(e) =>
                        setSeasonForm((p) => ({ ...p, adjustment_percent: e.target.value }))
                      }
                    />
                  </td>
                  <td style={td}>
                    <select
                      style={input}
                      value={seasonForm.unit_id}
                      onChange={(e) =>
                        setSeasonForm((p) => ({ ...p, unit_id: e.target.value }))
                      }
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
                    <input
                      type="number"
                      step="1"
                      style={input}
                      value={seasonForm.priority}
                      onChange={(e) =>
                        setSeasonForm((p) => ({ ...p, priority: e.target.value }))
                      }
                    />
                  </td>
                  <td style={td}>
                    <Button
                      size="sm"
                      icon={<Plus size={14} />}
                      onClick={addSeason}
                      loading={savingSeason}
                      aria-label="Aggiungi stagione"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* LEAD-TIME RULES */}
      <div style={card}>
        <h2 style={{ fontSize: 14, margin: "0 0 2px" }}>Regole lead-time</h2>
        <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "0 0 10px" }}>
          Modificano i prezzi consigliati in base ai giorni che mancano alla data
          (es. last-minute 0–3 giorni −15%, early-bird 180+ giorni +10%).
        </p>

        {loading ? (
          <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Caricamento…</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Etichetta</th>
                  <th style={th}>Giorni min</th>
                  <th style={th}>Giorni max</th>
                  <th style={th}>Agg. %</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td style={td}>{r.label}</td>
                    <td style={td}>{r.min_days}</td>
                    <td style={td}>{r.max_days == null ? "∞" : r.max_days}</td>
                    <td style={td}>
                      {r.adjustment_percent > 0 ? "+" : ""}
                      {r.adjustment_percent}%
                    </td>
                    <td style={td}>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 size={14} />}
                        onClick={() => removeRule(r.id)}
                        aria-label="Rimuovi regola"
                      />
                    </td>
                  </tr>
                ))}
                {rules.length === 0 && (
                  <tr>
                    <td style={{ ...td, color: "var(--color-text-muted)" }} colSpan={5}>
                      Nessuna regola lead-time.
                    </td>
                  </tr>
                )}
                <tr>
                  <td style={td}>
                    <input
                      style={input}
                      placeholder="Last minute"
                      value={ruleForm.label}
                      onChange={(e) => setRuleForm((p) => ({ ...p, label: e.target.value }))}
                    />
                  </td>
                  <td style={td}>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      style={input}
                      value={ruleForm.min_days}
                      onChange={(e) =>
                        setRuleForm((p) => ({ ...p, min_days: e.target.value }))
                      }
                    />
                  </td>
                  <td style={td}>
                    <input
                      type="number"
                      step="1"
                      style={input}
                      placeholder="∞"
                      value={ruleForm.max_days}
                      onChange={(e) =>
                        setRuleForm((p) => ({ ...p, max_days: e.target.value }))
                      }
                    />
                  </td>
                  <td style={td}>
                    <input
                      type="number"
                      step="1"
                      style={input}
                      placeholder="-15"
                      value={ruleForm.adjustment_percent}
                      onChange={(e) =>
                        setRuleForm((p) => ({ ...p, adjustment_percent: e.target.value }))
                      }
                    />
                  </td>
                  <td style={td}>
                    <Button
                      size="sm"
                      icon={<Plus size={14} />}
                      onClick={addRule}
                      loading={savingRule}
                      aria-label="Aggiungi regola"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
