import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download } from "lucide-react";
import { Button, useToast } from "../ui";
import { getMonthPnL, getAdvancedKpis, downloadOwnerMonthlyReportCsv } from "../../services/api";
import { loadSections } from "../../services/loadSections";
import { formatCurrency } from "../../utils/format";

const COLORS = ["var(--color-primary)", "var(--color-info)", "var(--color-warning)", "var(--color-accent)"];
const SOURCE_COLORS = { direct: "var(--color-success)", airbnb: "var(--color-warning)", booking: "var(--color-info)" };

export default function MonthOverview({ period, onPeriodChange, refresh }) {
  const [result, setResult] = useState({ data: {}, failed: [] });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const toast = useToast();
  const [year, month] = period.split("-").map(Number);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadSections({ bilancio: () => getMonthPnL(year, month), indicatori: () => getAdvancedKpis(year, month) })
      .then(value => { if (!cancelled) { setResult(value); setLoading(false); } });
    return () => { cancelled = true; };
  }, [year, month, refresh]);

  async function exportReport() {
    setExporting(true);
    try {
      const blob = await downloadOwnerMonthlyReportCsv(year, month);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `report_${period}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(error.message || "Download non riuscito.");
    } finally { setExporting(false); }
  }

  const { bilancio: pnl, indicatori: kpis } = result.data;
  const sources = Object.entries(pnl?.revenue_by_source || {}).filter(([, value]) => value > 0)
    .map(([source, value]) => ({ source, name: source === "direct" ? "Diretta" : source, value }));
  const costs = [...(pnl?.costs_by_category || [])].sort((a, b) => b.total - a.total).slice(0, 5);
  const metrics = [
    ["Ricavi", pnl ? formatCurrency(pnl.revenue_total) : null],
    ["Costi", pnl ? formatCurrency(pnl.costs_total) : null],
    ["Risultato netto", pnl ? formatCurrency(pnl.profit) : null],
    ["Occupazione", pnl ? `${Number(pnl.occupancy_rate).toFixed(0)}%` : null],
    ["ADR / notte", pnl ? formatCurrency(pnl.adr) : null],
    ["RevPAR", kpis ? formatCurrency(kpis.revpar) : null],
    ["Prenotazioni dirette", kpis ? `${kpis.direct_share_percent}%` : null],
    ["Ricavi previsti a 30 giorni", kpis ? formatCurrency(kpis.pipeline_revenue_next_30_days) : null],
  ];

  return <div className="workbench__view" aria-busy={loading}>
    <div className="workbench__section-heading">
      <label className="workbench__period">Mese <input aria-label="Mese del rendiconto" type="month" value={period} min="2000-01" max="2100-12"
        onChange={event => { if (/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(event.target.value)) onPeriodChange(event.target.value); }} /></label>
      <Button variant="secondary" icon={<Download size={16} />} onClick={exportReport} loading={exporting}>Scarica report</Button>
    </div>
    {loading ? <p role="status" className="workbench__empty">Caricamento andamento...</p> : <>
      {result.failed.length > 0 && <p className="workbench__error" role="alert">Dati non disponibili: {result.failed.join(", ")}. Riprova con Aggiorna.</p>}
      <dl className="workbench__metrics workbench__metrics--finance">
        {metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? "N/D"}</dd></div>)}
      </dl>
      <div className="workbench__columns">
        <section className="workbench__section" aria-label="Provenienza ricavi">
          <h2>Provenienza ricavi</h2>
          {!pnl ? <p className="workbench__empty">Bilancio non disponibile.</p> : sources.length ? <div className="workbench__chart">
            <ResponsiveContainer width="100%" height="100%"><PieChart>
              <Pie data={sources} dataKey="value" innerRadius={55} outerRadius={80} paddingAngle={3} isAnimationActive={false}>
                {sources.map((source, index) => <Cell key={source.source} fill={SOURCE_COLORS[source.source] || COLORS[index % COLORS.length]} />)}
              </Pie><Tooltip formatter={value => formatCurrency(value)} /><Legend />
            </PieChart></ResponsiveContainer>
          </div> : <p className="workbench__empty">Nessun ricavo nel mese.</p>}
        </section>
        <section className="workbench__section" aria-label="Categorie di spesa">
          <h2>Principali categorie di spesa</h2>
          {!pnl ? <p className="workbench__empty">Bilancio non disponibile.</p> : costs.length ? <div className="workbench__chart">
            <ResponsiveContainer width="100%" height="100%"><BarChart data={costs} layout="vertical" margin={{ right: 12, left: 0 }}>
              <CartesianGrid stroke="var(--color-border)" horizontal={false} /><XAxis type="number" hide />
              <YAxis type="category" dataKey="category" width={100} tick={{ fontSize: 12, fill: "var(--color-text-muted)" }} />
              <Tooltip formatter={value => formatCurrency(value)} /><Bar dataKey="total" name="Importo" fill="var(--color-info)" barSize={20} isAnimationActive={false} />
            </BarChart></ResponsiveContainer>
          </div> : <p className="workbench__empty">Nessun costo nel mese.</p>}
        </section>
      </div>
    </>}
  </div>;
}
