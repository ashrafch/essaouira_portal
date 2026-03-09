import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getSmartAutomationExecutions,
  getSmartAutomationRules,
  getSmartScenes,
  runSmartScene,
  triggerSmartAutomationRule,
} from "../services/api";
import { AppCard, EmptyState, LoadingSkeleton, SectionHeader, StatusBadge } from "../components/ui";
import ActivityCard from "../components/dashboard/ActivityCard";

function SmartAutomation() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scenes, setScenes] = useState([]);
  const [rules, setRules] = useState([]);
  const [executions, setExecutions] = useState([]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [s, r, e] = await Promise.all([
        getSmartScenes(),
        getSmartAutomationRules(),
        getSmartAutomationExecutions({ limit: 30 }),
      ]);
      setScenes(s || []);
      setRules(r || []);
      setExecutions(e || []);
    } catch (err) {
      setError(err.message || "Errore caricamento automazioni");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const failedExec = useMemo(
    () => executions.filter((e) => ["failed", "partial"].includes(String(e.status || "").toLowerCase())),
    [executions],
  );

  async function handleRunScene(sceneId) {
    setError("");
    try {
      await runSmartScene(sceneId, { source: "ui.manual" });
      await load();
    } catch (err) {
      setError(err.message || "Errore esecuzione scena");
    }
  }

  async function handleTriggerRule(rule) {
    setError("");
    try {
      await triggerSmartAutomationRule(rule.id, {
        trigger_type: rule.trigger_type || "manual",
        trigger_source: "manual.api",
        context: { from_ui: true },
      });
      await load();
    } catch (err) {
      setError(err.message || "Errore trigger regola");
    }
  }

  return (
    <div>
      <SectionHeader
        title="Automazioni Smart"
        subtitle="Scene, regole e trace di esecuzione per controllo operativo e troubleshooting"
        right={<button type="button" onClick={() => navigate("/smart-dashboard")}>Apri dashboard</button>}
      />
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      {loading ? (
        <LoadingSkeleton rows={7} height={24} />
      ) : (
        <>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", marginBottom: 12 }}>
            <AppCard>
              <h3 style={{ marginTop: 0, marginBottom: 10 }}>Scene</h3>
              {scenes.length === 0 ? (
                <EmptyState title="Nessuna scena" description="Crea scene per azioni rapide su dispositivi smart" />
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {scenes.map((s) => (
                    <div key={s.id} style={{ border: "1px solid #eef2f7", borderRadius: 8, padding: 8, display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{s.name}</div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>{s.description || "Nessuna descrizione"}</div>
                      </div>
                      <button type="button" onClick={() => handleRunScene(s.id)}>Esegui scena</button>
                    </div>
                  ))}
                </div>
              )}
            </AppCard>

            <AppCard>
              <h3 style={{ marginTop: 0, marginBottom: 10 }}>Regole</h3>
              {rules.length === 0 ? (
                <EmptyState title="Nessuna regola" description="Aggiungi regole per trigger automatici o manuali" />
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {rules.map((r) => (
                    <div key={r.id} style={{ border: "1px solid #eef2f7", borderRadius: 8, padding: 8, display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{r.name}</div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          {r.trigger_type} ? {r.action_type}
                        </div>
                      </div>
                      <button type="button" onClick={() => handleTriggerRule(r)}>Esegui regola</button>
                    </div>
                  ))}
                </div>
              )}
            </AppCard>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <AppCard>
              <h3 style={{ marginTop: 0, marginBottom: 10 }}>Log esecuzioni</h3>
              {executions.length === 0 ? (
                <EmptyState title="Nessuna esecuzione" description="Il log si popola quando scene/regole vengono eseguite" />
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {executions.map((e) => (
                    <ActivityCard
                      key={e.id}
                      title={`#${e.id} · ${e.trigger_type}`}
                      subtitle={`${e.trigger_source} · correlation ${e.correlation_id || "n/d"}`}
                      severity={e.status === "failed" ? "critical" : e.status === "partial" ? "warning" : "info"}
                      timestamp={e.started_at || e.finished_at}
                      right={<StatusBadge status={e.status} />}
                    />
                  ))}
                </div>
              )}
            </AppCard>

            <AppCard>
              <h3 style={{ marginTop: 0, marginBottom: 10 }}>Errori recenti</h3>
              {failedExec.length === 0 ? (
                <EmptyState title="Nessun errore recente" description="Le esecuzioni sono stabili nel periodo selezionato" />
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {failedExec.map((e) => (
                    <ActivityCard
                      key={e.id}
                      title={`Esecuzione #${e.id}`}
                      subtitle={e.error_message || "Errore senza messaggio esplicito"}
                      severity={e.status === "failed" ? "critical" : "warning"}
                      timestamp={e.finished_at || e.started_at}
                    />
                  ))}
                </div>
              )}
            </AppCard>
          </div>
        </>
      )}
    </div>
  );
}

export default SmartAutomation;

