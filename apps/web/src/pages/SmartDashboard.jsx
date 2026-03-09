import { useEffect, useMemo, useState } from "react";
import {
  enableSmartScenarioPack,
  getEnabledSmartScenarioPacks,
  getProperties,
  getSmartDashboard,
  getSmartScenarioPacks,
  getUnits,
} from "../services/api";

function Card({ label, value, hint }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, background: "#fff" }}>
      <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {hint ? <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>{hint}</div> : null}
    </div>
  );
}

function ListBlock({ title, emptyText, items, renderItem }) {
  return (
    <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12 }}>
      <h3 style={{ marginTop: 0, marginBottom: 8 }}>{title}</h3>
      {items.length === 0 ? (
        <p style={{ color: "#6b7280", margin: 0 }}>{emptyText}</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {items.map(renderItem)}
        </div>
      )}
    </section>
  );
}

function SmartDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyPack, setBusyPack] = useState("");

  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [packDefs, setPackDefs] = useState([]);
  const [enabledPacks, setEnabledPacks] = useState([]);
  const [dashboard, setDashboard] = useState(null);

  const [propertyId, setPropertyId] = useState("");
  const [unitId, setUnitId] = useState("");

  const filteredUnits = useMemo(() => {
    if (!propertyId) return units;
    return units.filter((u) => u.property_id === Number(propertyId));
  }, [units, propertyId]);

  async function loadDashboardAndPacks(selectedPropertyId = propertyId, selectedUnitId = unitId) {
    const params = {};
    if (selectedPropertyId) params.property_id = Number(selectedPropertyId);
    if (selectedUnitId) params.unit_id = Number(selectedUnitId);
    const [dash, enabled] = await Promise.all([
      getSmartDashboard(params),
      getEnabledSmartScenarioPacks(selectedPropertyId ? { property_id: Number(selectedPropertyId) } : {}),
    ]);
    setDashboard(dash);
    setEnabledPacks(enabled || []);
  }

  async function loadAll(selectedPropertyId = propertyId, selectedUnitId = unitId) {
    setLoading(true);
    setError("");
    try {
      const [propsData, unitsData, packsData] = await Promise.all([
        getProperties(),
        getUnits(),
        getSmartScenarioPacks(),
      ]);
      setProperties(propsData || []);
      setUnits(unitsData || []);
      setPackDefs(packsData || []);
      await loadDashboardAndPacks(selectedPropertyId, selectedUnitId);
    } catch (err) {
      setError(err.message || "Errore caricamento Smart Dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyFilters(nextPropertyId, nextUnitId) {
    setActionError("");
    try {
      await loadDashboardAndPacks(nextPropertyId, nextUnitId);
    } catch (err) {
      setActionError(err.message || "Errore applicando filtri");
    }
  }

  async function handleEnablePack(packKey) {
    if (!propertyId) {
      setActionError("Seleziona prima una property.");
      return;
    }
    setBusyPack(packKey);
    setActionError("");
    try {
      await enableSmartScenarioPack({
        property_id: Number(propertyId),
        pack_key: packKey,
      });
      await loadDashboardAndPacks(propertyId, unitId);
    } catch (err) {
      setActionError(err.message || "Errore abilitazione scenario pack");
    } finally {
      setBusyPack("");
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Smart Dashboard</h1>
      <p style={{ color: "#6b7280" }}>
        Vista unificata: stato dispositivi, alert, esecuzioni automazioni e scenario packs attivi.
      </p>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12, marginBottom: 12 }}>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>Property</span>
            <select
              value={propertyId}
              onChange={(e) => {
                const nextPropertyId = e.target.value;
                setPropertyId(nextPropertyId);
                setUnitId("");
                applyFilters(nextPropertyId, "");
              }}
            >
              <option value="">Tutte le property</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>Unità</span>
            <select
              value={unitId}
              onChange={(e) => {
                const nextUnitId = e.target.value;
                setUnitId(nextUnitId);
                applyFilters(propertyId, nextUnitId);
              }}
            >
              <option value="">Tutte le unità</option>
              {filteredUnits.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {loading ? <p>Caricamento...</p> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {actionError ? <p style={{ color: "#b91c1c" }}>{actionError}</p> : null}

      {!loading && !error && dashboard ? (
        <>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", marginBottom: 12 }}>
            <Card label="Property" value={dashboard.kpis.total_properties} />
            <Card label="Unità" value={dashboard.kpis.total_units} />
            <Card label="Dispositivi" value={dashboard.kpis.total_devices} />
            <Card label="Online" value={dashboard.kpis.online_devices} />
            <Card label="Offline" value={dashboard.kpis.offline_devices} />
            <Card label="Warning" value={dashboard.kpis.warning_devices} />
            <Card label="Critical" value={dashboard.kpis.critical_devices} />
            <Card label="Alert aperti" value={dashboard.kpis.open_alerts} />
            <Card label="Exec oggi" value={dashboard.kpis.automation_executions_today} />
            <Card
              label="Exec fail/partial"
              value={`${dashboard.kpis.automation_failures_today}/${dashboard.kpis.automation_partial_today}`}
              hint="failed/partial"
            />
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <ListBlock
              title="Unità con criticità"
              emptyText="Nessuna unità critica nel filtro attuale."
              items={dashboard.problematic_units || []}
              renderItem={(item) => (
                <div key={`${item.unit_id || "na"}-${item.unit_name}`} style={{ border: "1px solid #eef2f7", borderRadius: 8, padding: 8 }}>
                  <strong>{item.unit_name}</strong>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    offline: {item.offline_devices} · warning: {item.warning_devices} · critical: {item.critical_devices}
                  </div>
                </div>
              )}
            />

            <ListBlock
              title="Top device issues"
              emptyText="Nessun device con alert di salute."
              items={dashboard.top_device_issues || []}
              renderItem={(item) => (
                <div key={item.device_id} style={{ border: "1px solid #eef2f7", borderRadius: 8, padding: 8 }}>
                  <strong>{item.name}</strong>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {item.unit_name || "Unassigned"} · {item.connectivity_status} · {item.health_status}
                  </div>
                </div>
              )}
            />

            <ListBlock
              title="Alert recenti"
              emptyText="Nessun alert recente."
              items={dashboard.recent_alerts || []}
              renderItem={(item) => (
                <div key={item.id} style={{ border: "1px solid #eef2f7", borderRadius: 8, padding: 8 }}>
                  <strong>{item.title}</strong>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{item.subtitle || "-"}</div>
                </div>
              )}
            />

            <ListBlock
              title="Automation failures recenti"
              emptyText="Nessun failure recente."
              items={dashboard.recent_automation_failures || []}
              renderItem={(item) => (
                <div key={item.id} style={{ border: "1px solid #eef2f7", borderRadius: 8, padding: 8 }}>
                  <strong>{item.title}</strong>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{item.subtitle || "-"}</div>
                </div>
              )}
            />

            <ListBlock
              title="Esecuzioni recenti"
              emptyText="Nessuna esecuzione registrata."
              items={dashboard.recent_executions || []}
              renderItem={(item) => (
                <div key={item.id} style={{ border: "1px solid #eef2f7", borderRadius: 8, padding: 8 }}>
                  <strong>{item.title}</strong>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{item.subtitle || "-"}</div>
                </div>
              )}
            />

            <ListBlock
              title="Provider connection status"
              emptyText="Nessuna provider connection nel filtro."
              items={dashboard.provider_statuses || []}
              renderItem={(item) => (
                <div key={item.connection_id} style={{ border: "1px solid #eef2f7", borderRadius: 8, padding: 8 }}>
                  <strong>{item.provider_name}</strong>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    property #{item.property_id} · {item.status} · {item.is_active ? "attiva" : "disattiva"}
                  </div>
                </div>
              )}
            />
          </div>

          <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12, marginTop: 12 }}>
            <h3 style={{ marginTop: 0 }}>Scenario Packs</h3>
            <p style={{ color: "#6b7280", marginTop: 0 }}>
              Abilita baseline smart riusabili per la property selezionata.
            </p>
            {propertyId ? null : (
              <p style={{ color: "#b45309" }}>Seleziona una property per abilitare un pack.</p>
            )}
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
              {packDefs.map((pack) => {
                const enabled = enabledPacks.find((p) => p.pack_key === pack.key);
                return (
                  <div key={pack.key} style={{ border: "1px solid #eef2f7", borderRadius: 10, padding: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <strong>{pack.name}</strong>
                      <span style={{ fontSize: 12, color: enabled ? "#047857" : "#6b7280" }}>
                        {enabled ? "enabled" : "not enabled"}
                      </span>
                    </div>
                    <p style={{ margin: "6px 0", color: "#6b7280", fontSize: 13 }}>{pack.description}</p>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      Include: {(pack.includes || []).join(", ")}
                    </div>
                    {(pack.notes || []).map((note) => (
                      <div key={note} style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
                        Note: {note}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleEnablePack(pack.key)}
                      disabled={!propertyId || busyPack === pack.key}
                      style={{ marginTop: 8 }}
                    >
                      {busyPack === pack.key ? "Abilitazione..." : (enabled ? "Reapply pack" : "Enable pack")}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

export default SmartDashboard;
