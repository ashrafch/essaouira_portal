import { useEffect, useState } from "react";
import {
  getSmartAutomationExecutions,
  getSmartAutomationRules,
  getSmartScenes,
  runSmartScene,
  triggerSmartAutomationRule,
} from "../services/api";

function SmartAutomation() {
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

  async function handleRunScene(sceneId) {
    setError("");
    try {
      await runSmartScene(sceneId, { source: "ui.manual" });
      await load();
    } catch (err) {
      setError(err.message || "Errore run scene");
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
      setError(err.message || "Errore trigger rule");
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Smart Automation</h1>
      <p style={{ color: "#6b7280" }}>Scene, regole e log esecuzioni per test operativo.</p>
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      {loading ? <p>Caricamento...</p> : (
        <>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr", marginBottom: 12 }}>
            <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12 }}>
              <h3 style={{ marginTop: 0 }}>Scene</h3>
              {scenes.length === 0 ? <p style={{ color: "#6b7280" }}>Nessuna scena.</p> : scenes.map((s) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span>{s.name}</span>
                  <button type="button" onClick={() => handleRunScene(s.id)}>Esegui</button>
                </div>
              ))}
            </section>

            <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12 }}>
              <h3 style={{ marginTop: 0 }}>Regole</h3>
              {rules.length === 0 ? <p style={{ color: "#6b7280" }}>Nessuna regola.</p> : rules.map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span>{r.name} ({r.trigger_type})</span>
                  <button type="button" onClick={() => handleTriggerRule(r)}>Trigger</button>
                </div>
              ))}
            </section>
          </div>

          <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>Execution Log</h3>
            {executions.length === 0 ? <p style={{ color: "#6b7280" }}>Nessuna esecuzione.</p> : (
              <div style={{ display: "grid", gap: 8 }}>
                {executions.map((e) => (
                  <div key={e.id} style={{ border: "1px solid #eef2f7", borderRadius: 8, padding: 8 }}>
                    <div style={{ fontWeight: 600 }}>
                      #{e.id} · {e.status} · {e.trigger_type}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      {e.trigger_source} · {e.correlation_id}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default SmartAutomation;
