import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AppCard, EmptyState, LoadingSkeleton, SectionHeader, StatCard } from "../components/ui";
import { getSmartOverview, getUnits } from "../services/api";

function SmartOverview() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState(null);
  const [units, setUnits] = useState([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [overviewData, unitsData] = await Promise.all([getSmartOverview(), getUnits()]);
        setOverview(overviewData);
        setUnits(unitsData || []);
      } catch (err) {
        setError(err.message || "Errore caricamento Smart Overview");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const healthData = useMemo(() => {
    if (!overview) return [];
    return [
      { name: "Online", value: overview.online_devices || 0, color: "var(--color-success)" },
      { name: "Offline", value: overview.offline_devices || 0, color: "var(--color-danger)" },
    ];
  }, [overview]);

  return (
    <div>
      <SectionHeader
        title="Smart Overview"
        subtitle="Panoramica rapida dello stato smart, con accesso diretto al dettaglio unità"
      />

      {loading ? <LoadingSkeleton rows={6} height={32} /> : null}
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}

      {!loading && !error && overview ? (
        <>
          <div className="ui-grid-cards" style={{ marginBottom: 12 }}>
            <StatCard label="Dispositivi totali" value={overview.total_devices} />
            <StatCard label="Online" value={overview.online_devices} tone="success" />
            <StatCard label="Offline" value={overview.offline_devices} tone="danger" />
            <StatCard label="Alert aperti" value={overview.open_alerts} tone="warning" />
            <StatCard label="Alert critici" value={overview.critical_alerts} tone="danger" />
            <StatCard label="Visti ultime 12h" value={overview.recently_seen_devices} tone="info" />
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <AppCard>
              <h3 style={{ marginBottom: 8 }}>Distribuzione device health</h3>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={healthData} dataKey="value" nameKey="name" outerRadius={78}>
                      {healthData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </AppCard>

            <AppCard>
              <h3 style={{ marginBottom: 8 }}>Unità disponibili</h3>
              {units.length === 0 ? (
                <EmptyState title="Nessuna unità trovata" description="Aggiungi unità dal setup/properties" />
              ) : (
                <div style={{ display: "grid", gap: 8, maxHeight: 220, overflow: "auto" }}>
                  {units.map((u) => (
                    <Link
                      key={u.id}
                      to={`/smart-units/${u.id}`}
                      style={{
                        border: "1px solid var(--color-border)",
                        borderRadius: 10,
                        padding: "8px 10px",
                        fontWeight: 600,
                        color: "var(--color-primary)",
                        background: "var(--color-surface-soft)",
                      }}
                    >
                      {u.name} · dettaglio smart
                    </Link>
                  ))}
                </div>
              )}
            </AppCard>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default SmartOverview;

