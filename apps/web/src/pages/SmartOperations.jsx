import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppCard, EmptyState, LoadingSkeleton, SectionHeader, StatCard, StatusBadge } from "../components/ui";
import FilterBar from "../components/dashboard/FilterBar";
import ActivityCard from "../components/dashboard/ActivityCard";
import {
  acknowledgeSmartAlert,
  getProperties,
  getSmartOperations,
  getUnits,
} from "../services/api";

function SmartOperations() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyAlertId, setBusyAlertId] = useState(null);
  const [operations, setOperations] = useState(null);
  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [filters, setFilters] = useState({
    property_id: "",
    unit_id: "",
    severity: "",
    issue_type: "",
    status: "",
  });

  const filteredUnits = useMemo(() => {
    if (!filters.property_id) return units;
    return units.filter((unit) => unit.property_id === Number(filters.property_id));
  }, [units, filters.property_id]);

  const issueTypeOptions = [
    "alert.open",
    "device.offline",
    "device.health.warning",
    "device.health.critical",
    "automation.failed",
    "automation.partial",
    "telemetry.temperature_abnormal",
    "telemetry.humidity_abnormal",
    "telemetry.energy_spike",
    "telemetry.device_not_reporting",
    "telemetry.sensor_value_out_of_range",
    "maintenance.smart_related",
    "staff_task.impacted",
  ];

  const buildParams = useCallback(() => {
    const params = {};
    if (filters.property_id) params.property_id = Number(filters.property_id);
    if (filters.unit_id) params.unit_id = Number(filters.unit_id);
    if (filters.severity) params.severity = filters.severity;
    if (filters.issue_type) params.issue_type = filters.issue_type;
    if (filters.status) params.status = filters.status;
    return params;
  }, [filters]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = buildParams();
      const [opsData, propertiesData, unitsData] = await Promise.all([
        getSmartOperations(params),
        getProperties(),
        getUnits(),
      ]);
      setOperations(opsData);
      setProperties(propertiesData || []);
      setUnits(unitsData || []);
    } catch (err) {
      setError(err.message || "Errore caricamento Smart Operations");
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function onFilterChange(field, value) {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
      ...(field === "property_id" ? { unit_id: "" } : {}),
    }));
  }

  async function handleAcknowledgeAlert(alertId) {
    setBusyAlertId(alertId);
    setActionError("");
    try {
      await acknowledgeSmartAlert(alertId);
      await loadData();
    } catch (err) {
      setActionError(err.message || "Errore presa in carico alert");
    } finally {
      setBusyAlertId(null);
    }
  }

  function openIssue(issue) {
    if (issue.unit_id) {
      navigate(`/smart-units/${issue.unit_id}`);
      return;
    }
    if (issue.device_id) {
      navigate(`/smart-devices/${issue.device_id}`);
      return;
    }
    navigate("/smart-dashboard");
  }

  function issueActionButton(issue) {
    if (issue.suggested_action === "acknowledge_alert" && issue.alert_id) {
      return (
        <button
          type="button"
          onClick={() => handleAcknowledgeAlert(issue.alert_id)}
          disabled={busyAlertId === issue.alert_id}
        >
          {busyAlertId === issue.alert_id ? "..." : "Prendi in carico"}
        </button>
      );
    }
    if (issue.suggested_action === "open_maintenance") {
      return <button type="button" onClick={() => navigate("/maintenance")}>Apri manutenzioni</button>;
    }
    if (issue.suggested_action === "open_automation") {
      return <button type="button" onClick={() => navigate("/smart-automation")}>Apri automazioni</button>;
    }
    if (issue.suggested_action === "open_staff_planner") {
      return <button type="button" onClick={() => navigate("/staff-planner")}>Apri planner staff</button>;
    }
    if (issue.device_id) {
      return <button type="button" onClick={() => navigate(`/smart-devices/${issue.device_id}`)}>Apri device</button>;
    }
    if (issue.unit_id) {
      return <button type="button" onClick={() => navigate(`/smart-units/${issue.unit_id}`)}>Apri unita</button>;
    }
    return <button type="button" onClick={() => navigate("/smart-dashboard")}>Apri dashboard</button>;
  }

  return (
    <div>
      <SectionHeader
        title="Smart Operations Mode"
        subtitle="Vista operativa action-first: unita con criticita, issue prioritarie e attivita recente."
        right={(
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => navigate("/smart-dashboard")}>Smart dashboard</button>
            <button type="button" onClick={() => navigate("/smart-alerts")}>Alert smart</button>
          </div>
        )}
      />

      <FilterBar>
        <label style={{ minWidth: 180 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>Property</span>
          <select value={filters.property_id} onChange={(event) => onFilterChange("property_id", event.target.value)}>
            <option value="">Tutte</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ minWidth: 180 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>Unita</span>
          <select value={filters.unit_id} onChange={(event) => onFilterChange("unit_id", event.target.value)}>
            <option value="">Tutte</option>
            {filteredUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ minWidth: 140 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>Severita</span>
          <select value={filters.severity} onChange={(event) => onFilterChange("severity", event.target.value)}>
            <option value="">Tutte</option>
            <option value="critical">critical</option>
            <option value="warning">warning</option>
            <option value="info">info</option>
          </select>
        </label>
        <label style={{ minWidth: 180 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>Tipo issue</span>
          <select value={filters.issue_type} onChange={(event) => onFilterChange("issue_type", event.target.value)}>
            <option value="">Tutti</option>
            {issueTypeOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label style={{ minWidth: 140 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>Stato</span>
          <select value={filters.status} onChange={(event) => onFilterChange("status", event.target.value)}>
            <option value="">Tutti</option>
            <option value="open">open</option>
            <option value="planned">planned</option>
            <option value="in_progress">in_progress</option>
            <option value="todo">todo</option>
            <option value="acknowledged">acknowledged</option>
            <option value="resolved">resolved</option>
          </select>
        </label>
      </FilterBar>

      {loading ? <LoadingSkeleton rows={8} height={26} /> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {actionError ? <p style={{ color: "#b91c1c" }}>{actionError}</p> : null}

      {!loading && !error && operations ? (
        <>
          <div className="ui-grid-cards" style={{ marginBottom: 12 }}>
            <StatCard label="Unita da attenzionare" value={operations.summary.units_needing_attention} tone="warning" />
            <StatCard label="Issue aperte" value={operations.summary.open_issues} tone="warning" />
            <StatCard label="Issue critical" value={operations.summary.critical_issues} tone="danger" />
            <StatCard label="Alert aperti" value={operations.summary.open_alerts} tone="warning" />
            <StatCard label="Device offline" value={operations.summary.offline_devices} tone="danger" />
            <StatCard label="Device unhealthy" value={operations.summary.unhealthy_devices} tone="warning" />
            <StatCard label="Automation fail/parziali" value={operations.summary.automation_failures_recent} tone="danger" />
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <AppCard>
              <h3 style={{ marginBottom: 8 }}>Unita che richiedono intervento</h3>
              {(operations.units_needing_attention || []).length === 0 ? (
                <EmptyState title="Nessuna unita da attenzionare" />
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {operations.units_needing_attention.map((unit) => (
                    <div key={unit.unit_id} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <strong>{unit.unit_name}</strong>
                        <StatusBadge status={unit.severity} />
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
                        score {unit.attention_score} · alert {unit.open_alerts} · offline {unit.offline_devices} · fail {unit.automation_failures}
                      </div>
                      {unit.reasons?.length ? (
                        <div style={{ marginTop: 6, fontSize: 12, color: "#334155" }}>
                          {unit.reasons.join(" · ")}
                        </div>
                      ) : null}
                      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" onClick={() => navigate(`/smart-units/${unit.unit_id}`)}>Apri unita</button>
                        <button type="button" onClick={() => navigate("/smart-alerts")}>Apri alert</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AppCard>

            <AppCard>
              <h3 style={{ marginBottom: 8 }}>Issue operative smart</h3>
              {(operations.issues || []).length === 0 ? (
                <EmptyState title="Nessuna issue con i filtri correnti" />
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {operations.issues.map((issue) => (
                    <ActivityCard
                      key={issue.issue_id}
                      title={issue.title}
                      subtitle={`${issue.issue_type} · ${issue.unit_name || "Unita n/d"}`}
                      severity={issue.severity}
                      timestamp={issue.last_seen_at || issue.occurred_at}
                      onClick={() => openIssue(issue)}
                      right={issueActionButton(issue)}
                    />
                  ))}
                </div>
              )}
            </AppCard>

            <AppCard>
              <h3 style={{ marginBottom: 8 }}>Attivita recente</h3>
              {(operations.activity || []).length === 0 ? (
                <EmptyState title="Nessuna attivita recente" />
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {operations.activity.map((item) => (
                    <ActivityCard
                      key={item.id}
                      title={item.title}
                      subtitle={item.subtitle || ""}
                      severity={item.severity}
                      timestamp={item.occurred_at}
                      onClick={() => {
                        if (item.refs?.unit_id) {
                          navigate(`/smart-units/${item.refs.unit_id}`);
                          return;
                        }
                        if (item.refs?.device_id) {
                          navigate(`/smart-devices/${item.refs.device_id}`);
                          return;
                        }
                        if (item.refs?.alert_id) {
                          navigate("/smart-alerts");
                          return;
                        }
                        navigate("/smart-dashboard");
                      }}
                    />
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

export default SmartOperations;
