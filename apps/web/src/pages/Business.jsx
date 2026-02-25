import { useEffect, useMemo, useState } from "react";
import {
  downloadMonthCostLinesCsv,
  getMonthPnL,
  getMonthCostLines,
  getUnits,
  getChannelPerformance,
  getChannelConnections,
  createChannelConnection,
  updateChannelConnection,
  getRevenueRules,
  createRevenueRule,
  updateRevenueRule,
  getRateRecommendations,
} from "../services/api";

function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}

function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("it-IT");
}

function Business() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-12

  const [pnl, setPnl] = useState(null);
  const [costLines, setCostLines] = useState([]);
  const [units, setUnits] = useState([]);
  const [channelPerformance, setChannelPerformance] = useState([]);
  const [channelConnections, setChannelConnections] = useState([]);
  const [revenueRules, setRevenueRules] = useState([]);
  const [rateRecommendations, setRateRecommendations] = useState([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesError, setRulesError] = useState("");
  const [channelForm, setChannelForm] = useState({
    id: null,
    channel: "airbnb",
    listing_external_id: "",
    commission_percent: "15",
    payout_delay_days: "0",
    is_active: true,
    sync_enabled: false,
    notes: "",
  });
  const [ruleForm, setRuleForm] = useState({
    id: null,
    name: "",
    priority: "100",
    min_occupancy_percent: "0",
    max_occupancy_percent: "100",
    min_lead_days: "0",
    max_lead_days: "365",
    adjustment_percent: "0",
    min_price: "",
    max_price: "",
    is_active: true,
    notes: "",
  });
  const [recommendationFilters, setRecommendationFilters] = useState({
    from_date: `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-01`,
    to_date: `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(
      Math.min(today.getDate() + 7, 28)
    )}`,
    unit_id: "",
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  const [selectedCostCategory, setSelectedCostCategory] = useState("all");

  // mappa unità
  const unitMap = useMemo(
    () =>
      units.reduce((acc, u) => {
        acc[u.id] = u;
        return acc;
      }, {}),
    [units]
  );

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [
          pnlResp,
          costLinesResp,
          unitsResp,
          channelPerfResp,
          channelsResp,
          rulesResp,
        ] = await Promise.all([
          getMonthPnL(year, month),
          getMonthCostLines(year, month),
          getUnits(),
          getChannelPerformance(year, month),
          getChannelConnections(),
          getRevenueRules(),
        ]);
        setPnl(pnlResp);
        setCostLines(costLinesResp);
        setUnits(unitsResp);
        setChannelPerformance(channelPerfResp || []);
        setChannelConnections(channelsResp || []);
        setRevenueRules(rulesResp || []);
      } catch (err) {
        setError(err.message || "Errore caricando i dati business");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [year, month]);

  const monthInputValue = `${year}-${pad2(month)}`;

  const visibleCostLines = useMemo(() => {
    return costLines.filter((c) =>
      selectedCostCategory === "all"
        ? true
        : c.category === selectedCostCategory
    );
  }, [costLines, selectedCostCategory]);

  const selectedCategoryTotal = useMemo(() => {
    if (!pnl || selectedCostCategory === "all") return null;
    const found = pnl.costs_by_category.find(
      (c) => c.category === selectedCostCategory
    );
    return found ? found.total : null;
  }, [pnl, selectedCostCategory]);

  const selectedCategoryPerc = useMemo(() => {
    if (!pnl || selectedCostCategory === "all") return null;
    if (!pnl.costs_total || pnl.costs_total <= 0) return null;
    const found = pnl.costs_by_category.find(
      (c) => c.category === selectedCostCategory
    );
    if (!found) return null;
    return (found.total / pnl.costs_total) * 100;
  }, [pnl, selectedCostCategory]);

  function getOriginLabel(line) {
    switch (line.origin) {
      case "manual":
        return "Manuale";
      case "booking_cleaning_fee":
        return "Booking · Cleaning fee";
      case "booking_channel_fee":
        return "Booking · Channel fee";
      case "booking_city_tax":
        return "Booking · City tax";
      case "staff_task":
        return "Staff task";
      default:
        return line.origin || "Altro";
    }
  }

  async function handleExportCsv() {
    setExporting(true);
    try {
      const blob = await downloadMonthCostLinesCsv(year, month);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `month_cost_lines_${year}_${pad2(month)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Errore export CSV: ${err.message}`);
    } finally {
      setExporting(false);
    }
  }

  async function reloadRevenueBlocks() {
    setRulesLoading(true);
    setRulesError("");
    try {
      const [channelsResp, rulesResp, channelPerfResp] = await Promise.all([
        getChannelConnections(),
        getRevenueRules(),
        getChannelPerformance(year, month),
      ]);
      setChannelConnections(channelsResp || []);
      setRevenueRules(rulesResp || []);
      setChannelPerformance(channelPerfResp || []);
    } catch (err) {
      setRulesError(err.message || "Errore aggiornando i blocchi revenue");
    } finally {
      setRulesLoading(false);
    }
  }

  async function handleSaveChannelConnection(e) {
    e.preventDefault();
    try {
      const payload = {
        channel: channelForm.channel,
        listing_external_id: channelForm.listing_external_id || null,
        commission_percent: Number(channelForm.commission_percent || 0),
        payout_delay_days: Number(channelForm.payout_delay_days || 0),
        is_active: Boolean(channelForm.is_active),
        sync_enabled: Boolean(channelForm.sync_enabled),
        notes: channelForm.notes || null,
      };
      if (channelForm.id) {
        await updateChannelConnection(channelForm.id, {
          ...payload,
          last_sync_status: null,
          last_sync_at: null,
        });
      } else {
        await createChannelConnection(payload);
      }
      setChannelForm({
        id: null,
        channel: "airbnb",
        listing_external_id: "",
        commission_percent: "15",
        payout_delay_days: "0",
        is_active: true,
        sync_enabled: false,
        notes: "",
      });
      await reloadRevenueBlocks();
    } catch (err) {
      setRulesError(err.message || "Errore salvataggio canale");
    }
  }

  async function handleSaveRevenueRule(e) {
    e.preventDefault();
    try {
      const payload = {
        name: ruleForm.name,
        priority: Number(ruleForm.priority || 100),
        min_occupancy_percent: Number(ruleForm.min_occupancy_percent || 0),
        max_occupancy_percent: Number(ruleForm.max_occupancy_percent || 100),
        min_lead_days: Number(ruleForm.min_lead_days || 0),
        max_lead_days: Number(ruleForm.max_lead_days || 365),
        adjustment_percent: Number(ruleForm.adjustment_percent || 0),
        min_price: ruleForm.min_price === "" ? null : Number(ruleForm.min_price),
        max_price: ruleForm.max_price === "" ? null : Number(ruleForm.max_price),
        is_active: Boolean(ruleForm.is_active),
        notes: ruleForm.notes || null,
      };
      if (ruleForm.id) {
        await updateRevenueRule(ruleForm.id, payload);
      } else {
        await createRevenueRule(payload);
      }
      setRuleForm({
        id: null,
        name: "",
        priority: "100",
        min_occupancy_percent: "0",
        max_occupancy_percent: "100",
        min_lead_days: "0",
        max_lead_days: "365",
        adjustment_percent: "0",
        min_price: "",
        max_price: "",
        is_active: true,
        notes: "",
      });
      await reloadRevenueBlocks();
    } catch (err) {
      setRulesError(err.message || "Errore salvataggio regola");
    }
  }

  async function handleLoadRecommendations(e) {
    e.preventDefault();
    try {
      const data = await getRateRecommendations({
        from_date: recommendationFilters.from_date,
        to_date: recommendationFilters.to_date,
        unit_id: recommendationFilters.unit_id || undefined,
      });
      setRateRecommendations(data || []);
    } catch (err) {
      setRulesError(err.message || "Errore caricando suggerimenti tariffari");
    }
  }

  // ---- styles ----

  const page = {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  };

  const header = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 4,
    flexWrap: "wrap",
    gap: 8,
  };

  const cardGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  };

  const card = {
    background: "white",
    borderRadius: 14,
    padding: 12,
    boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
    border: "1px solid #e5e7eb",
  };

  const cardTitle = {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.04,
    color: "#6b7280",
    marginBottom: 4,
  };

  const cardValue = {
    fontSize: 20,
    fontWeight: 600,
    color: "#111827",
  };

  const cardSub = {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 2,
  };

  const sectionTitle = {
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 6,
    color: "#111827",
  };

  const sectionRow = {
    display: "grid",
    gridTemplateColumns: "1.2fr 1fr",
    gap: 12,
  };

  const table = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 12,
  };

  const th = {
    textAlign: "left",
    borderBottom: "1px solid #e5e7eb",
    padding: "6px 4px",
    color: "#6b7280",
    fontSize: 11,
  };

  const td = {
    borderBottom: "1px solid #f3f4f6",
    padding: "6px 4px",
    verticalAlign: "top",
  };

  const clickableRow = (active) => ({
    cursor: "pointer",
    backgroundColor: active ? "#ecfdf5" : "transparent",
  });

  const smallButton = {
    borderRadius: 999,
    border: "1px solid #d1d5db",
    padding: "4px 10px",
    fontSize: 11,
    color: "gray",
    background: "#f9fafb",
    cursor: "pointer",
  };

  return (
    <div style={page}>
      <div style={header}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Business & Analytics</h1>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Panoramica mensile di ricavi, costi e performance degli
            appartamenti.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
          <label
            style={{
              fontSize: 11,
              color: "#6b7280",
              marginRight: 6,
            }}
          >
            Mese di riferimento
          </label>
          <input
            type="month"
            value={monthInputValue}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-").map(Number);
              setYear(y);
              setMonth(m);
            }}
            style={{
              borderRadius: 8,
              border: "1px solid #d1d5db",
              padding: "6px 8px",
              fontSize: 13,
            }}
          />
          <button
            type="button"
            style={smallButton}
            onClick={handleExportCsv}
            disabled={exporting}
          >
            {exporting ? "Export..." : "Export costi CSV"}
          </button>
        </div>
      </div>

      {error && (
        <p style={{ color: "red", fontSize: 12, marginBottom: 4 }}>{error}</p>
      )}

      {loading || !pnl ? (
        <p style={{ fontSize: 13 }}>Caricamento dati business...</p>
      ) : (
        <>
          {/* KPI principali */}
          <div style={cardGrid}>
            <div style={card}>
              <div style={cardTitle}>Occupazione</div>
              <div style={cardValue}>{pnl.occupancy_rate.toFixed(1)}%</div>
              <div style={cardSub}>
                {pnl.nights_occupied} notti occupate su{" "}
                {pnl.nights_total} disponibili
              </div>
            </div>
            <div style={card}>
              <div style={cardTitle}>Ricavi totali</div>
              <div style={cardValue}>{pnl.revenue_total.toFixed(2)} €</div>
              <div style={cardSub}>
                ADR (tariffa media per notte):{" "}
                {pnl.adr != null ? `${pnl.adr.toFixed(2)} €` : "—"}
              </div>
            </div>
            <div style={card}>
              <div style={cardTitle}>Costi totali</div>
              <div style={cardValue}>{pnl.costs_total.toFixed(2)} €</div>
              <div style={cardSub}>
                Somma di tutte le spese (booking, staff e costi manuali) nel
                mese.
              </div>
            </div>
            <div style={card}>
              <div style={cardTitle}>Profitto del mese</div>
              <div
                style={{
                  ...cardValue,
                  color: pnl.profit >= 0 ? "#15803d" : "#b91c1c",
                }}
              >
                {pnl.profit.toFixed(2)} €
              </div>
              <div style={cardSub}>
                Ricavi − Costi (tutti i canali e tutte le unità).
              </div>
            </div>
          </div>

          {/* Ricavi per sorgente / unità */}
          <div style={sectionRow}>
            <div style={card}>
              <div style={sectionTitle}>Ricavi per sorgente</div>
              {Object.keys(pnl.revenue_by_source || {}).length === 0 ? (
                <p style={{ fontSize: 12, color: "#6b7280" }}>
                  Nessun ricavo per il mese selezionato.
                </p>
              ) : (
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Sorgente</th>
                      <th style={th}>Ricavi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(pnl.revenue_by_source).map(
                      ([src, value]) => (
                        <tr key={src}>
                          <td style={td}>{src || "Altro"}</td>
                          <td style={td}>{value.toFixed(2)} €</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              )}
            </div>

            <div style={card}>
              <div style={sectionTitle}>Ricavi per unità</div>
              {pnl.revenue_by_unit.length === 0 ? (
                <p style={{ fontSize: 12, color: "#6b7280" }}>
                  Nessuna prenotazione nel mese selezionato.
                </p>
              ) : (
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Unità</th>
                      <th style={th}>Notti occupate</th>
                      <th style={th}>Ricavi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pnl.revenue_by_unit.map((u) => (
                      <tr key={u.unit_id}>
                        <td style={td}>{u.unit_name}</td>
                        <td style={td}>{u.nights_occupied}</td>
                        <td style={td}>{u.revenue.toFixed(2)} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Costi per categoria + dettaglio */}
          <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
            <div style={card}>
              <div style={sectionTitle}>Costi per categoria</div>
              {pnl.costs_by_category.length === 0 ? (
                <p style={{ fontSize: 12, color: "#6b7280" }}>
                  Nessun costo registrato nel mese selezionato.
                </p>
              ) : (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 6,
                      gap: 8,
                    }}
                  >
                    <p style={{ fontSize: 11, color: "#6b7280" }}>
                      Il valore in tabella è il{" "}
                      <strong>totale dei costi</strong> per ciascuna
                      categoria nel mese selezionato.
                      <br />
                      La colonna % indica quanto pesa quella categoria sui{" "}
                      <strong>costi totali del mese</strong>.
                      <br />
                      Clicca una riga per filtrare il dettaglio sotto.
                    </p>
                    <button
                      type="button"
                      style={smallButton}
                      onClick={() => setSelectedCostCategory("all")}
                    >
                      Mostra tutte le categorie
                    </button>
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table style={table}>
                      <thead>
                        <tr>
                          <th style={th}>Categoria</th>
                          <th style={{ ...th, textAlign: "right" }}>
                            Totale costi (mese)
                          </th>
                          <th style={{ ...th, textAlign: "right" }}>
                            % sul totale costi
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {pnl.costs_by_category.map((c) => {
                          const active = selectedCostCategory === c.category;
                          const perc =
                            pnl.costs_total > 0
                              ? (c.total / pnl.costs_total) * 100
                              : 0;

                          return (
                            <tr
                              key={c.category}
                              style={clickableRow(active)}
                              onClick={() =>
                                setSelectedCostCategory(
                                  active ? "all" : c.category
                                )
                              }
                            >
                              <td style={td}>{c.category}</td>
                              <td
                                style={{
                                  ...td,
                                  textAlign: "right",
                                  fontWeight: active ? 600 : 400,
                                }}
                              >
                                {c.total.toFixed(2)} €
                              </td>
                              <td
                                style={{
                                  ...td,
                                  textAlign: "right",
                                  fontSize: 11,
                                  color: "#4b5563",
                                }}
                              >
                                {perc.toFixed(1)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div style={card}>
              <div style={sectionTitle}>Dettaglio costi del mese</div>
              <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
                Stai visualizzando:{" "}
                <strong>
                  {selectedCostCategory === "all"
                    ? "tutte le categorie"
                    : selectedCostCategory}
                </strong>
                {selectedCostCategory !== "all" &&
                  selectedCategoryTotal != null && (
                    <>
                      {" "}
                      · Totale costi:{" "}
                      <strong>
                        {selectedCategoryTotal.toFixed(2)} €
                      </strong>
                      {selectedCategoryPerc != null && (
                        <>
                          {" "}
                          (
                          <strong>
                            {selectedCategoryPerc.toFixed(1)}%
                          </strong>{" "}
                          dei costi totali)
                        </>
                      )}
                    </>
                  )}
                . Qui vedi concretamente da dove arrivano i totali sopra
                (booking, staff e costi manuali).
              </p>

              {visibleCostLines.length === 0 ? (
                <p style={{ fontSize: 12, color: "#6b7280" }}>
                  Nessun costo registrato per il filtro selezionato.
                </p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={th}>Data</th>
                        <th style={th}>Categoria</th>
                        <th style={th}>Origine</th>
                        <th style={th}>Riferimento</th>
                        <th style={th}>Descrizione</th>
                        <th style={th}>Unità</th>
                        <th style={th}>Importo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleCostLines.map((c, idx) => (
                        <tr
                          key={
                            c.id ??
                            `${c.origin}-${c.booking_id || ""}-${
                              c.staff_task_id || ""
                            }-${idx}`
                          }
                        >
                          <td style={td}>{formatDate(c.date)}</td>
                          <td style={td}>{c.category}</td>
                          <td style={td}>{getOriginLabel(c)}</td>
                          <td style={td}>
                            {c.booking_id
                              ? `Booking #${c.booking_id}`
                              : c.staff_task_id
                              ? `Task #${c.staff_task_id}`
                              : "—"}
                          </td>
                          <td style={td}>{c.description || "—"}</td>
                          <td style={td}>
                            {c.unit_id
                              ? unitMap[c.unit_id]?.name ||
                                `Unit #${c.unit_id}`
                              : "—"}
                          </td>
                          <td style={td}>
                            {c.currency || "EUR"}{" "}
                            {Number(c.amount).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
            <div style={card}>
              <div style={sectionTitle}>Performance canali (Distribution)</div>
              {channelPerformance.length === 0 ? (
                <p style={{ fontSize: 12, color: "#6b7280" }}>
                  Nessuna metrica canali disponibile per il periodo selezionato.
                </p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={th}>Canale</th>
                        <th style={th}>Booking</th>
                        <th style={th}>Notti</th>
                        <th style={th}>Ricavi lordi</th>
                        <th style={th}>Fee canale</th>
                        <th style={th}>Ricavi netti</th>
                        <th style={th}>ADR</th>
                        <th style={th}>Commissione media</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channelPerformance.map((row) => (
                        <tr key={row.channel}>
                          <td style={td}>{row.channel}</td>
                          <td style={td}>{row.bookings_count}</td>
                          <td style={td}>{row.nights}</td>
                          <td style={td}>{row.gross_revenue.toFixed(2)} €</td>
                          <td style={td}>{row.channel_fees.toFixed(2)} €</td>
                          <td style={td}>{row.net_revenue.toFixed(2)} €</td>
                          <td style={td}>{row.adr != null ? `${row.adr.toFixed(2)} €` : "—"}</td>
                          <td style={td}>
                            {row.avg_commission_percent != null
                              ? `${row.avg_commission_percent.toFixed(2)}%`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={sectionRow}>
              <div style={card}>
                <div style={sectionTitle}>Channel Connections</div>
                <form onSubmit={handleSaveChannelConnection} style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <select
                      style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "6px 8px" }}
                      value={channelForm.channel}
                      onChange={(e) =>
                        setChannelForm((s) => ({ ...s, channel: e.target.value }))
                      }
                    >
                      <option value="direct">direct</option>
                      <option value="airbnb">airbnb</option>
                      <option value="booking">booking</option>
                      <option value="vrbo">vrbo</option>
                      <option value="expedia">expedia</option>
                      <option value="other">other</option>
                    </select>
                    <input
                      style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "6px 8px" }}
                      value={channelForm.listing_external_id}
                      onChange={(e) =>
                        setChannelForm((s) => ({ ...s, listing_external_id: e.target.value }))
                      }
                      placeholder="Listing external id"
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <input
                      type="number"
                      style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "6px 8px" }}
                      value={channelForm.commission_percent}
                      onChange={(e) =>
                        setChannelForm((s) => ({ ...s, commission_percent: e.target.value }))
                      }
                      placeholder="Commission %"
                    />
                    <input
                      type="number"
                      style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "6px 8px" }}
                      value={channelForm.payout_delay_days}
                      onChange={(e) =>
                        setChannelForm((s) => ({ ...s, payout_delay_days: e.target.value }))
                      }
                      placeholder="Payout delay days"
                    />
                  </div>
                  <input
                    style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "6px 8px" }}
                    value={channelForm.notes}
                    onChange={(e) => setChannelForm((s) => ({ ...s, notes: e.target.value }))}
                    placeholder="Note"
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <label style={{ fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={channelForm.is_active}
                        onChange={(e) =>
                          setChannelForm((s) => ({ ...s, is_active: e.target.checked }))
                        }
                      />{" "}
                      Attivo
                    </label>
                    <label style={{ fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={channelForm.sync_enabled}
                        onChange={(e) =>
                          setChannelForm((s) => ({ ...s, sync_enabled: e.target.checked }))
                        }
                      />{" "}
                      Sync attiva
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="submit" style={smallButton} disabled={rulesLoading}>
                      {channelForm.id ? "Aggiorna canale" : "Aggiungi canale"}
                    </button>
                    {channelForm.id ? (
                      <button
                        type="button"
                        style={smallButton}
                        onClick={() =>
                          setChannelForm({
                            id: null,
                            channel: "airbnb",
                            listing_external_id: "",
                            commission_percent: "15",
                            payout_delay_days: "0",
                            is_active: true,
                            sync_enabled: false,
                            notes: "",
                          })
                        }
                      >
                        Annulla modifica
                      </button>
                    ) : null}
                  </div>
                </form>
                <div style={{ marginTop: 10, fontSize: 12 }}>
                  {channelConnections.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        marginBottom: 6,
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        padding: "6px 8px",
                        background: "white",
                        cursor: "pointer",
                      }}
                      onClick={() =>
                        setChannelForm({
                          id: c.id,
                          channel: c.channel,
                          listing_external_id: c.listing_external_id || "",
                          commission_percent: String(c.commission_percent ?? "0"),
                          payout_delay_days: String(c.payout_delay_days ?? "0"),
                          is_active: Boolean(c.is_active),
                          sync_enabled: Boolean(c.sync_enabled),
                          notes: c.notes || "",
                        })
                      }
                    >
                      {c.channel} · {Number(c.commission_percent || 0).toFixed(2)}%
                    </button>
                  ))}
                </div>
              </div>

              <div style={card}>
                <div style={sectionTitle}>Revenue Rules & Rate Suggestions</div>
                <form onSubmit={handleSaveRevenueRule} style={{ display: "grid", gap: 8 }}>
                  <input
                    style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "6px 8px" }}
                    value={ruleForm.name}
                    onChange={(e) => setRuleForm((s) => ({ ...s, name: e.target.value }))}
                    placeholder="Nome regola"
                    required
                  />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <input
                      type="number"
                      style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "6px 8px" }}
                      value={ruleForm.adjustment_percent}
                      onChange={(e) =>
                        setRuleForm((s) => ({ ...s, adjustment_percent: e.target.value }))
                      }
                      placeholder="Adjustment %"
                    />
                    <input
                      type="number"
                      style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "6px 8px" }}
                      value={ruleForm.priority}
                      onChange={(e) => setRuleForm((s) => ({ ...s, priority: e.target.value }))}
                      placeholder="Priority"
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <input
                      type="number"
                      style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "6px 8px" }}
                      value={ruleForm.min_occupancy_percent}
                      onChange={(e) =>
                        setRuleForm((s) => ({ ...s, min_occupancy_percent: e.target.value }))
                      }
                      placeholder="Min occupancy %"
                    />
                    <input
                      type="number"
                      style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "6px 8px" }}
                      value={ruleForm.max_occupancy_percent}
                      onChange={(e) =>
                        setRuleForm((s) => ({ ...s, max_occupancy_percent: e.target.value }))
                      }
                      placeholder="Max occupancy %"
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <input
                      type="number"
                      style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "6px 8px" }}
                      value={ruleForm.min_lead_days}
                      onChange={(e) =>
                        setRuleForm((s) => ({ ...s, min_lead_days: e.target.value }))
                      }
                      placeholder="Min lead days"
                    />
                    <input
                      type="number"
                      style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "6px 8px" }}
                      value={ruleForm.max_lead_days}
                      onChange={(e) =>
                        setRuleForm((s) => ({ ...s, max_lead_days: e.target.value }))
                      }
                      placeholder="Max lead days"
                    />
                  </div>
                  <button type="submit" style={smallButton} disabled={rulesLoading}>
                    {ruleForm.id ? "Aggiorna regola" : "Aggiungi regola"}
                  </button>
                </form>
                <div style={{ marginTop: 10, fontSize: 12 }}>
                  {revenueRules.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        marginBottom: 6,
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        padding: "6px 8px",
                        background: "white",
                        cursor: "pointer",
                      }}
                      onClick={() =>
                        setRuleForm({
                          id: r.id,
                          name: r.name,
                          priority: String(r.priority ?? 100),
                          min_occupancy_percent: String(r.min_occupancy_percent ?? 0),
                          max_occupancy_percent: String(r.max_occupancy_percent ?? 100),
                          min_lead_days: String(r.min_lead_days ?? 0),
                          max_lead_days: String(r.max_lead_days ?? 365),
                          adjustment_percent: String(r.adjustment_percent ?? 0),
                          min_price: r.min_price == null ? "" : String(r.min_price),
                          max_price: r.max_price == null ? "" : String(r.max_price),
                          is_active: Boolean(r.is_active),
                          notes: r.notes || "",
                        })
                      }
                    >
                      {r.name} · {Number(r.adjustment_percent || 0).toFixed(2)}%
                    </button>
                  ))}
                </div>

                <form
                  onSubmit={handleLoadRecommendations}
                  style={{ marginTop: 12, display: "grid", gap: 8 }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600 }}>Suggerimenti tariffari</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    <input
                      type="date"
                      style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "6px 8px" }}
                      value={recommendationFilters.from_date}
                      onChange={(e) =>
                        setRecommendationFilters((s) => ({ ...s, from_date: e.target.value }))
                      }
                    />
                    <input
                      type="date"
                      style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "6px 8px" }}
                      value={recommendationFilters.to_date}
                      onChange={(e) =>
                        setRecommendationFilters((s) => ({ ...s, to_date: e.target.value }))
                      }
                    />
                    <select
                      style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "6px 8px" }}
                      value={recommendationFilters.unit_id}
                      onChange={(e) =>
                        setRecommendationFilters((s) => ({ ...s, unit_id: e.target.value }))
                      }
                    >
                      <option value="">Tutte le unità</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" style={smallButton}>Calcola suggerimenti</button>
                </form>
                <div style={{ maxHeight: 180, overflowY: "auto", marginTop: 8, fontSize: 12 }}>
                  {rateRecommendations.length === 0 ? (
                    <div style={{ color: "#6b7280" }}>Nessun suggerimento caricato.</div>
                  ) : (
                    rateRecommendations.map((it) => (
                      <div key={it.date} style={{ marginBottom: 6 }}>
                        {it.date} · base {Number(it.base_rate).toFixed(2)}€ · suggerita{" "}
                        {Number(it.suggested_rate).toFixed(2)}€ ·{" "}
                        {it.applied_rule_name || "no-rule"}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            {rulesError ? <p style={{ color: "#b91c1c", fontSize: 12 }}>{rulesError}</p> : null}
          </div>
        </>
      )}
    </div>
  );
}

export default Business;

