import { useEffect, useMemo, useState } from "react";
import { getMonthPnL, getCostItems, getUnits } from "../services/api";

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
  const [costItems, setCostItems] = useState([]);
  const [units, setUnits] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  // calcolo range mese per chiamare /cost-items
  function getMonthRange(y, m) {
    const start = `${y}-${pad2(m)}-01`;
    const nextMonth = m === 12 ? { y: y + 1, m: 1 } : { y: y, m: m + 1 };
    const end = `${nextMonth.y}-${pad2(nextMonth.m)}-01`;
    return { from_date: start, to_date: end };
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const range = getMonthRange(year, month);
        const [pnlResp, costResp, unitsResp] = await Promise.all([
          getMonthPnL(year, month),
          getCostItems(range),
          getUnits(),
        ]);
        setPnl(pnlResp);
        setCostItems(costResp);
        setUnits(unitsResp);
      } catch (err) {
        setError(err.message || "Errore caricando i dati business");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [year, month]);

  const monthInputValue = `${year}-${pad2(month)}`;

  const costCategories = useMemo(() => {
    if (!pnl) return [];
    return pnl.costs_by_category?.map((c) => c.category) || [];
  }, [pnl]);

  const visibleCostItems = useMemo(() => {
    return costItems.filter((c) =>
      selectedCostCategory === "all"
        ? true
        : c.category === selectedCostCategory
    );
  }, [costItems, selectedCostCategory]);

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

  const pill = (bg, color, border = "transparent") => ({
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 8px",
    borderRadius: 999,
    fontSize: 11,
    backgroundColor: bg,
    color,
    border: `1px solid ${border}`,
  });

  const costCategoryChip = (active) =>
    pill(
      active ? "#0f766e" : "#f3f4f6",
      active ? "white" : "#374151",
      active ? "#0f766e" : "#e5e7eb"
    );

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
        <div>
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
                Somma di costi staff, fee di prenotazione e costi extra
                registrati nel mese.
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
                Ricavi − Costi (tutte le unità e tutti i canali).
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
                      flexWrap: "wrap",
                      gap: 6,
                      marginBottom: 6,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedCostCategory("all")}
                      style={{
                        ...costCategoryChip(selectedCostCategory === "all"),
                        cursor: "pointer",
                      }}
                    >
                      Tutte le categorie
                    </button>
                    {pnl.costs_by_category.map((c) => (
                      <button
                        key={c.category}
                        type="button"
                        onClick={() => setSelectedCostCategory(c.category)}
                        style={{
                          ...costCategoryChip(
                            selectedCostCategory === c.category
                          ),
                          cursor: "pointer",
                        }}
                      >
                        {c.category} · {c.total.toFixed(2)} €
                      </button>
                    ))}
                  </div>
                  <p
                    style={{
                      fontSize: 11,
                      color: "#6b7280",
                      marginTop: 2,
                    }}
                  >
                    Questi importi includono:
                    {" "}
                    fee legate alle prenotazioni
                    (cleaning fee, commissioni canale, tassa di soggiorno nel mese del
                    check-out),
                    costi dello staff (da task) e eventuali costi extra inseriti
                    manualmente (CostItem).
                  </p>
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
                . In questa tabella vedi nel dettaglio solo i costi
                inseriti manualmente (CostItem). Le categorie generate
                automaticamente da prenotazioni e task dello staff potrebbero
                non avere righe qui.
              </p>

              {visibleCostItems.length === 0 ? (
                <p style={{ fontSize: 12, color: "#6b7280" }}>
                  Nessun costo manuale registrato per il filtro selezionato.
                </p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={th}>Data</th>
                        <th style={th}>Categoria</th>
                        <th style={th}>Descrizione</th>
                        <th style={th}>Unità</th>
                        <th style={th}>Importo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleCostItems.map((c) => (
                        <tr key={c.id}>
                          <td style={td}>{formatDate(c.date)}</td>
                          <td style={td}>{c.category}</td>
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
        </>
      )}
    </div>
  );
}

export default Business;
