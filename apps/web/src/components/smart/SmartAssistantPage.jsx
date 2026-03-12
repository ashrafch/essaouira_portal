import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AppCard,
  EmptyState,
  FreshnessBadge,
  LastUpdatedIndicator,
  LiveStatusDot,
  LoadingSkeleton,
  SectionHeader,
  StatCard,
} from "../ui";
import FilterBar from "../dashboard/FilterBar";
import ActivityCard from "../dashboard/ActivityCard";
import ReadinessBadge from "./ReadinessBadge";
import ReadinessScoreCard from "./ReadinessScoreCard";
import {
  acknowledgeSmartAlert,
  getProperties,
  getSmartCheckinAssistant,
  getSmartCheckoutAssistant,
  getUnits,
  runSmartScene,
} from "../../services/api";

function defaultDateWindow() {
  const today = new Date();
  const end = new Date(today);
  end.setDate(today.getDate() + 3);
  return {
    date_from: today.toISOString().slice(0, 10),
    date_to: end.toISOString().slice(0, 10),
  };
}

function asDateLabel(value) {
  if (!value) return "n/d";
  return new Date(value).toLocaleDateString("it-IT");
}

function asTimeLabel(value) {
  if (!value) return "n/d";
  return String(value).slice(0, 5);
}

function SmartAssistantPage({ assistantType = "checkin" }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [runningAction, setRunningAction] = useState("");
  const [items, setItems] = useState([]);
  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [filters, setFilters] = useState({
    property_id: "",
    unit_id: "",
    status: "",
    ...defaultDateWindow(),
  });

  const assistantApi = assistantType === "checkin" ? getSmartCheckinAssistant : getSmartCheckoutAssistant;
  const pageTitle = assistantType === "checkin" ? "Check-in Smart Assistant" : "Checkout Smart Assistant";
  const pageSubtitle = assistantType === "checkin"
    ? "Vista guidata per validare arrivi imminenti con readiness, task e segnali smart."
    : "Vista guidata per chiudere il soggiorno e riportare l'unita in eco/off mode.";

  const filteredUnits = useMemo(() => {
    if (!filters.property_id) return units;
    return units.filter((unit) => unit.property_id === Number(filters.property_id));
  }, [units, filters.property_id]);

  const summary = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.total += 1;
        const status = item.assistant_status || "UNKNOWN";
        if (status === "READY") acc.ready += 1;
        if (status === "NEEDS_ATTENTION") acc.needsAttention += 1;
        if (status === "BLOCKED") acc.blocked += 1;
        if (status === "UNKNOWN") acc.unknown += 1;
        return acc;
      },
      { total: 0, ready: 0, needsAttention: 0, blocked: 0, unknown: 0 },
    );
  }, [items]);

  const buildParams = useCallback(() => {
    const params = {};
    if (filters.property_id) params.property_id = Number(filters.property_id);
    if (filters.unit_id) params.unit_id = Number(filters.unit_id);
    if (filters.status) params.status = filters.status;
    if (filters.date_from) params.date_from = filters.date_from;
    if (filters.date_to) params.date_to = filters.date_to;
    return params;
  }, [filters]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = buildParams();
      const [assistantData, propertiesData, unitsData] = await Promise.all([
        assistantApi(params),
        getProperties(),
        getUnits(),
      ]);
      setItems(assistantData || []);
      setProperties(propertiesData || []);
      setUnits(unitsData || []);
    } catch (err) {
      setError(err.message || "Errore caricamento assistant");
    } finally {
      setLoading(false);
    }
  }, [assistantApi, buildParams]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function updateFilter(field, value) {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
      ...(field === "property_id" ? { unit_id: "" } : {}),
    }));
  }

  async function handleQuickAction(action) {
    const actionKey = `${action.action_type}-${action.scene_id || action.alert_id || action.booking_id || action.unit_id || "na"}`;
    setRunningAction(actionKey);
    setActionError("");
    try {
      if (action.action_type === "run_scene" && action.scene_id) {
        await runSmartScene(action.scene_id, {
          source: `ui.${assistantType}_assistant`,
          booking_id: action.booking_id,
          unit_id: action.unit_id,
          assistant_type: assistantType,
        });
        await loadData();
        return;
      }
      if (action.action_type === "acknowledge_alert" && action.alert_id) {
        await acknowledgeSmartAlert(action.alert_id);
        await loadData();
        return;
      }
      if (action.route) {
        navigate(action.route);
      }
    } catch (err) {
      setActionError(err.message || "Azione assistant non riuscita");
    } finally {
      setRunningAction("");
    }
  }

  return (
    <div>
      <SectionHeader
        title={pageTitle}
        subtitle={pageSubtitle}
        right={(
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <LiveStatusDot active={!document.hidden} title="Vista operativa manual refresh" />
              <LastUpdatedIndicator value={new Date().toISOString()} label="Vista" />
              <FreshnessBadge status={items.some((item) => item.data_freshness_status === "stale") ? "stale" : "fresh"} />
            </span>
            <button type="button" onClick={loadData}>Aggiorna assistant</button>
            <button type="button" onClick={() => navigate("/smart-dashboard")}>Smart dashboard</button>
            <button type="button" onClick={() => navigate("/smart-operations")}>Smart operations</button>
          </div>
        )}
      />

      <FilterBar>
        <label style={{ minWidth: 180 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>Property</span>
          <select value={filters.property_id} onChange={(event) => updateFilter("property_id", event.target.value)}>
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
          <select value={filters.unit_id} onChange={(event) => updateFilter("unit_id", event.target.value)}>
            <option value="">Tutte</option>
            {filteredUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ minWidth: 160 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>Stato</span>
          <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
            <option value="">Tutti</option>
            <option value="READY">READY</option>
            <option value="NEEDS_ATTENTION">NEEDS_ATTENTION</option>
            <option value="BLOCKED">BLOCKED</option>
            <option value="UNKNOWN">UNKNOWN</option>
          </select>
        </label>
        <label style={{ minWidth: 160 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>Dal</span>
          <input type="date" value={filters.date_from} onChange={(event) => updateFilter("date_from", event.target.value)} />
        </label>
        <label style={{ minWidth: 160 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>Al</span>
          <input type="date" value={filters.date_to} onChange={(event) => updateFilter("date_to", event.target.value)} />
        </label>
      </FilterBar>

      {loading ? <LoadingSkeleton rows={8} height={28} /> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {actionError ? <p style={{ color: "#b91c1c" }}>{actionError}</p> : null}

      {!loading && !error ? (
        <>
          <div className="ui-grid-cards" style={{ marginBottom: 12 }}>
            <StatCard label="Booking in vista" value={summary.total} />
            <StatCard label="Ready" value={summary.ready} tone="success" />
            <StatCard label="Needs attention" value={summary.needsAttention} tone="warning" />
            <StatCard label="Blocked" value={summary.blocked} tone="danger" />
            <StatCard label="Unknown" value={summary.unknown} tone="info" />
          </div>

          {items.length === 0 ? (
            <EmptyState
              title={`Nessuna vista ${assistantType} disponibile`}
              description="Allarga la finestra date o verifica che esistano booking nel periodo selezionato."
            />
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {items.map((item) => (
                <AppCard key={`${assistantType}-${item.booking.id}`}>
                  <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ display: "grid", gap: 4 }}>
                        <h3 style={{ margin: 0 }}>{item.booking.guest_name}</h3>
                        <div style={{ color: "#64748b", fontSize: 14 }}>
                          {item.booking.unit_name}
                          {item.booking.property_name ? ` · ${item.booking.property_name}` : ""}
                          {assistantType === "checkin"
                            ? ` · arrivo ${asDateLabel(item.booking.checkin_date)}`
                            : ` · partenza ${asDateLabel(item.booking.checkout_date)}`}
                          {assistantType === "checkin" && item.booking.estimated_arrival_time
                            ? ` · ETA ${asTimeLabel(item.booking.estimated_arrival_time)}`
                            : ""}
                        </div>
                        <div style={{ color: "#0f172a", fontSize: 14 }}>{item.assistant_summary}</div>
                      </div>
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                        <ReadinessBadge status={item.assistant_status} />
                        <ReadinessScoreCard
                          status={item.assistant_status}
                          score={item.readiness_score}
                          blockingReasons={item.blocking_reasons}
                          warningReasons={item.warning_reasons}
                        />
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                      <div>
                        <h4 style={{ margin: "0 0 8px" }}>Blocchi e warning</h4>
                        {item.blocking_reasons.length === 0 && item.warning_reasons.length === 0 ? (
                          <EmptyState title="Nessun blocco rilevato" />
                        ) : (
                          <div style={{ display: "grid", gap: 8 }}>
                            {item.blocking_reasons.map((reason) => (
                              <ActivityCard key={`b-${reason}`} title={reason} severity="critical" />
                            ))}
                            {item.warning_reasons.map((reason) => (
                              <ActivityCard key={`w-${reason}`} title={reason} severity="warning" />
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <h4 style={{ margin: "0 0 8px" }}>Checklist device essenziali</h4>
                        {item.essential_devices.length === 0 ? (
                          <EmptyState title="Nessun device essenziale associato" />
                        ) : (
                          <div style={{ display: "grid", gap: 8 }}>
                            {item.essential_devices.map((device) => (
                              <ActivityCard
                                key={device.device_id}
                                title={device.name}
                                subtitle={`${device.category} · ${device.status_label}`}
                                severity={device.ok ? "info" : device.health_status === "critical" ? "critical" : "warning"}
                                timestamp={device.last_seen_at}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <h4 style={{ margin: "0 0 8px" }}>
                          {assistantType === "checkout" ? "Device ancora attivi" : "Alert aperti"}
                        </h4>
                        {(assistantType === "checkout" ? item.devices_still_active : item.open_alerts).length === 0 ? (
                          <EmptyState
                            title={assistantType === "checkout" ? "Nessun device attivo" : "Nessun alert aperto"}
                          />
                        ) : (
                          <div style={{ display: "grid", gap: 8 }}>
                            {(assistantType === "checkout" ? item.devices_still_active : item.open_alerts).map((entry) => (
                              <ActivityCard
                                key={`${assistantType}-${entry.device_id || entry.alert_id}`}
                                title={entry.name || entry.title}
                                subtitle={entry.category || `${entry.alert_type} · ${entry.status}`}
                                severity={entry.health_status === "critical" || entry.severity === "critical" ? "critical" : "warning"}
                                timestamp={entry.last_seen_at}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                      <div>
                        <h4 style={{ margin: "0 0 8px" }}>Task operative collegate</h4>
                        {item.staff_tasks.length === 0 ? (
                          <EmptyState title="Nessuna task rilevante nel periodo" />
                        ) : (
                          <div style={{ display: "grid", gap: 8 }}>
                            {item.staff_tasks.map((task) => (
                              <ActivityCard
                                key={task.task_id}
                                title={`${task.task_type} · ${task.status}`}
                                subtitle={`Data ${asDateLabel(task.date)}${task.assignee_name ? ` · ${task.assignee_name}` : ""}`}
                                severity={task.status === "done" ? "info" : "warning"}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <h4 style={{ margin: "0 0 8px" }}>Maintenance e automazioni</h4>
                        {item.maintenance_issues.length === 0 && item.automation_failures.length === 0 ? (
                          <EmptyState title="Nessuna issue tecnica recente" />
                        ) : (
                          <div style={{ display: "grid", gap: 8 }}>
                            {item.maintenance_issues.map((maintenance) => (
                              <ActivityCard
                                key={`m-${maintenance.maintenance_id}`}
                                title={maintenance.title}
                                subtitle={`Maintenance · ${maintenance.status}${maintenance.priority ? ` · ${maintenance.priority}` : ""}`}
                                severity={maintenance.blocking ? "critical" : "warning"}
                                timestamp={maintenance.updated_at}
                              />
                            ))}
                            {item.automation_failures.map((execution) => (
                              <ActivityCard
                                key={`e-${execution.execution_id}`}
                                title={`Automation ${execution.status}`}
                                subtitle={execution.error_message || execution.trigger_type}
                                severity={execution.status === "failed" ? "critical" : "warning"}
                                timestamp={execution.finished_at || execution.started_at}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <h4 style={{ margin: "0 0 8px" }}>Eventi recenti unita</h4>
                        {item.recent_events.length === 0 ? (
                          <EmptyState title="Nessun evento recente" />
                        ) : (
                          <div style={{ display: "grid", gap: 8 }}>
                            {item.recent_events.map((event) => (
                              <ActivityCard
                                key={event.timeline_id}
                                title={event.title}
                                subtitle={event.description || event.source}
                                severity={event.severity}
                                timestamp={event.occurred_at}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {item.quick_actions.map((action) => {
                        const actionKey = `${action.action_type}-${action.scene_id || action.alert_id || action.booking_id || action.unit_id || "na"}`;
                        return (
                          <button
                            key={actionKey}
                            type="button"
                            onClick={() => handleQuickAction(action)}
                            disabled={!action.enabled || runningAction === actionKey}
                          >
                            {runningAction === actionKey ? "Eseguo..." : action.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </AppCard>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

export default SmartAssistantPage;
