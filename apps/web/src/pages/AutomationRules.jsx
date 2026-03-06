import { useEffect, useMemo, useState } from "react";
import PageInfoHelp from "../components/PageInfoHelp";
import useIsMobile from "../hooks/useIsMobile";
import {
  createAutomationRule,
  getAutomationExecutions,
  getAutomationRules,
  getDevices,
  getUnits,
  triggerAutomationRule,
} from "../services/api";

function AutomationRules() {
  const isMobile = useIsMobile(900);
  const [rules, setRules] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [devices, setDevices] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyRuleId, setBusyRuleId] = useState(null);

  const [form, setForm] = useState({
    name: "",
    trigger_type: "manual",
    action_type: "create_alert",
    target_device_id: "",
    target_unit_id: "",
    title: "Automation alert",
    description: "",
    command_type: "power_on",
  });

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [ruleList, executionList, deviceList, unitList] = await Promise.all([
        getAutomationRules(),
        getAutomationExecutions({ limit: 30 }),
        getDevices(),
        getUnits(),
      ]);
      setRules(ruleList || []);
      setExecutions(executionList || []);
      setDevices(deviceList || []);
      setUnits(unitList || []);
    } catch (err) {
      setError(err.message || "Errore caricando automation rules");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreateRule(e) {
    e.preventDefault();
    try {
      if (!form.name.trim()) return;
      const payload = {
        name: form.name.trim(),
        description: "",
        trigger_type: form.trigger_type,
        trigger_filter: {},
        action_type: form.action_type,
        target_device_id: form.target_device_id ? Number(form.target_device_id) : null,
        target_unit_id: form.target_unit_id ? Number(form.target_unit_id) : null,
        payload:
          form.action_type === "device_command"
            ? { command_type: form.command_type, payload: {} }
            : {
                alert_type: "automation_rule",
                severity: "warning",
                title: form.title || "Automation alert",
                description: form.description || null,
              },
        is_active: true,
      };
      await createAutomationRule(payload);
      setForm((prev) => ({ ...prev, name: "" }));
      await loadData();
    } catch (err) {
      setError(err.message || "Errore creazione regola");
    }
  }

  async function handleTriggerRule(ruleId) {
    setBusyRuleId(ruleId);
    try {
      await triggerAutomationRule(ruleId, {
        trigger_type: "manual",
        context: { source: "automation_rules_ui" },
      });
      await loadData();
    } catch (err) {
      setError(err.message || "Errore trigger regola");
    } finally {
      setBusyRuleId(null);
    }
  }

  const unitMap = useMemo(() => {
    const map = {};
    units.forEach((u) => {
      map[u.id] = u.name;
    });
    return map;
  }, [units]);

  const deviceMap = useMemo(() => {
    const map = {};
    devices.forEach((d) => {
      map[d.id] = d.name;
    });
    return map;
  }, [devices]);

  const card = {
    background: "linear-gradient(180deg,#fff 0%,#f8fafc 100%)",
    borderRadius: 16,
    padding: 14,
    border: "1px solid #e2e8f0",
    boxShadow: "0 8px 20px rgba(15,23,42,0.05)",
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Automation Rules</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Regole trigger/action minime con tracciamento esecuzioni.
          </p>
        </div>
        <PageInfoHelp title="Come usare Automation Rules">
          <p>In questa fase i trigger disponibili sono base; l'esecuzione manuale permette test controllati.</p>
          <p>Ogni run crea una execution tracciata con esito deterministico.</p>
        </PageInfoHelp>
      </div>

      {loading ? <div style={card}>Caricamento automation rules...</div> : null}
      {error ? <div style={{ ...card, color: "#b91c1c" }}>{error}</div> : null}

      <div style={card}>
        <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 15 }}>Nuova regola</h3>
        <form onSubmit={handleCreateRule} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(150px, 1fr))", gap: 8 }}>
          <input
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Nome regola"
            style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "8px 10px", fontSize: 13 }}
          />
          <select
            value={form.trigger_type}
            onChange={(e) => setForm((prev) => ({ ...prev, trigger_type: e.target.value }))}
            style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "8px 10px", fontSize: 13 }}
          >
            <option value="manual">manual</option>
            <option value="booking_checked_in">booking_checked_in</option>
            <option value="booking_checked_out">booking_checked_out</option>
            <option value="alert_raised">alert_raised</option>
          </select>
          <select
            value={form.action_type}
            onChange={(e) => setForm((prev) => ({ ...prev, action_type: e.target.value }))}
            style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "8px 10px", fontSize: 13 }}
          >
            <option value="create_alert">create_alert</option>
            <option value="device_command">device_command</option>
            <option value="create_maintenance_ticket">create_maintenance_ticket</option>
            <option value="create_staff_task">create_staff_task</option>
          </select>
          <select
            value={form.target_unit_id}
            onChange={(e) => setForm((prev) => ({ ...prev, target_unit_id: e.target.value }))}
            style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "8px 10px", fontSize: 13 }}
          >
            <option value="">Unit target (opzionale)</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                #{u.id} - {u.name}
              </option>
            ))}
          </select>

          {form.action_type === "device_command" ? (
            <>
              <select
                value={form.target_device_id}
                onChange={(e) => setForm((prev) => ({ ...prev, target_device_id: e.target.value }))}
                style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "8px 10px", fontSize: 13 }}
              >
                <option value="">Device target</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    #{d.id} - {d.name}
                  </option>
                ))}
              </select>
              <select
                value={form.command_type}
                onChange={(e) => setForm((prev) => ({ ...prev, command_type: e.target.value }))}
                style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "8px 10px", fontSize: 13 }}
              >
                <option value="power_on">power_on</option>
                <option value="power_off">power_off</option>
              </select>
            </>
          ) : (
            <>
              <input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Titolo alert/ticket"
                style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "8px 10px", fontSize: 13 }}
              />
              <input
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Descrizione"
                style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "8px 10px", fontSize: 13 }}
              />
            </>
          )}

          <button
            type="submit"
            style={{ borderRadius: 999, border: "1px solid #0f766e", padding: "8px 12px", background: "#0f766e", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            Crea regola
          </button>
        </form>
      </div>

      {!loading && rules.length === 0 ? <div style={card}>Nessuna regola configurata.</div> : null}

      {!loading && rules.length > 0 ? (
        <div style={{ ...card, display: "grid", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Regole configurate</h3>
          {rules.map((rule) => (
            <div key={rule.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 10, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{rule.name}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    trigger: {rule.trigger_type} - action: {rule.action_type}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                    unit: {rule.target_unit_id ? `${rule.target_unit_id} (${unitMap[rule.target_unit_id] || "n/d"})` : "n/d"} - device: {rule.target_device_id ? `${rule.target_device_id} (${deviceMap[rule.target_device_id] || "n/d"})` : "n/d"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleTriggerRule(rule.id)}
                  disabled={busyRuleId === rule.id}
                  style={{ borderRadius: 999, border: "1px solid #0f766e", padding: "4px 10px", fontSize: 12, background: "#f0fdfa", color: "#115e59", fontWeight: 600, cursor: "pointer" }}
                >
                  {busyRuleId === rule.id ? "Run..." : "Trigger manuale"}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div style={card}>
        <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 15 }}>Execution log (ultimi 30)</h3>
        {executions.length === 0 ? (
          <div style={{ fontSize: 13, color: "#64748b" }}>Nessuna execution registrata.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {executions.map((ex) => (
              <div key={ex.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 10, background: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <strong>
                    #{ex.id} - {ex.rule_id ? `rule ${ex.rule_id}` : `scene ${ex.scene_id}`}
                  </strong>
                  <span style={{ fontSize: 11, color: ex.status === "executed" ? "#166534" : ex.status === "partial" ? "#9a3412" : "#b91c1c", fontWeight: 700 }}>
                    {ex.status}
                  </span>
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
                  trigger: {ex.trigger_type} - started: {ex.started_at ? new Date(ex.started_at).toLocaleString("it-IT") : "n/d"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AutomationRules;
