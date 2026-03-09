import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getProperties,
  getSetupSession,
  getSmartDevices,
  getSmartProviderConnections,
  getUnits,
  setupAssignDevices,
  setupComplete,
  setupConnectProvider,
  setupEnableAutomations,
  setupImportDevices,
  setupProperty,
  setupStart,
  setupUnits,
} from "../services/api";
import {
  AppCard,
  EmptyState,
  LoadingSkeleton,
  SectionHeader,
  StatusBadge,
} from "../components/ui";
import FilterBar from "../components/dashboard/FilterBar";

const STEPS = [
  { key: "property", label: "Property" },
  { key: "units", label: "Units" },
  { key: "connect_provider", label: "Provider" },
  { key: "import_devices", label: "Devices" },
  { key: "assign_devices", label: "Mapping" },
  { key: "enable_automations", label: "Automations" },
  { key: "complete", label: "Finish" },
];

function SetupWizard() {
  const [session, setSession] = useState(null);
  const [units, setUnits] = useState([]);
  const [devices, setDevices] = useState([]);
  const [properties, setProperties] = useState([]);
  const [providerConnections, setProviderConnections] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [propertyForm, setPropertyForm] = useState({
    property_name: "",
    timezone: "Africa/Casablanca",
    currency: "EUR",
  });
  const [unitsInput, setUnitsInput] = useState("Unit A, Unit B, Unit C");
  const [providerForm, setProviderForm] = useState({ provider: "mock", config: {} });
  const [templates, setTemplates] = useState(["basic_hospitality_pack"]);

  const currentStep = session?.current_step || "property";
  const metadata = session?.metadata || {};
  const selectedPropertyId = metadata.property_id || "";
  const selectedConnectionId = metadata.provider_connection_id || "";

  const importedDeviceIds = useMemo(
    () => (Array.isArray(metadata.imported_device_ids) ? metadata.imported_device_ids : []),
    [metadata.imported_device_ids],
  );

  const importedDevices = useMemo(() => {
    if (!Array.isArray(devices) || importedDeviceIds.length === 0) return [];
    const setIds = new Set(importedDeviceIds);
    return devices.filter((d) => setIds.has(d.id));
  }, [devices, importedDeviceIds]);

  const propertyScopedUnits = useMemo(() => {
    if (!selectedPropertyId) return units;
    return units.filter((u) => u.property_id === Number(selectedPropertyId));
  }, [units, selectedPropertyId]);

  const propertyScopedConnections = useMemo(() => {
    if (!selectedPropertyId) return providerConnections;
    return providerConnections.filter((c) => c.property_id === Number(selectedPropertyId));
  }, [providerConnections, selectedPropertyId]);

  const refreshReferenceData = useCallback(async () => {
    const [unitsData, devicesData, propertiesData, connectionsData] = await Promise.all([
      getUnits(),
      getSmartDevices(),
      getProperties(),
      getSmartProviderConnections(),
    ]);
    setUnits(unitsData || []);
    setDevices(devicesData || []);
    setProperties(propertiesData || []);
    setProviderConnections(connectionsData || []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let current = await getSetupSession();
      if (!current) {
        const started = await setupStart();
        current = started.session;
      }
      setSession(current);
      await refreshReferenceData();
    } catch (err) {
      setError(err.message || "Errore caricamento setup wizard");
    } finally {
      setLoading(false);
    }
  }, [refreshReferenceData]);

  useEffect(() => {
    load();
  }, [load]);

  async function runStep(action) {
    setError("");
    setSuccess("");
    try {
      const updated = await action();
      setSession(updated.session ? updated.session : updated);
      await refreshReferenceData();
      setSuccess("Step completato.");
    } catch (err) {
      setError(err.message || "Errore step wizard");
    }
  }

  if (loading) return <LoadingSkeleton rows={9} height={26} />;

  return (
    <div>
      <SectionHeader
        title="Property Setup Wizard"
        subtitle="Onboarding guidato e resumable: property, provider, devices, mapping, automation packs"
      />

      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      {success && <p style={{ color: "#065f46" }}>{success}</p>}

      <FilterBar>
        {STEPS.map((step, idx) => {
          const isCurrent = step.key === currentStep;
          const done = STEPS.findIndex((s) => s.key === currentStep) > idx || session?.status === "completed";
          return (
            <div
              key={step.key}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: 8,
                minWidth: 110,
                background: isCurrent ? "#dbeafe" : done ? "#dcfce7" : "#fff",
              }}
            >
              <div style={{ fontSize: 12, color: "#6b7280" }}>Step {idx + 1}</div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{step.label}</div>
            </div>
          );
        })}
      </FilterBar>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <AppCard>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Step 1 · Property</h3>
          <div style={{ display: "grid", gap: 8 }}>
            <input
              placeholder="Property name"
              value={propertyForm.property_name}
              onChange={(e) => setPropertyForm((prev) => ({ ...prev, property_name: e.target.value }))}
            />
            <input
              placeholder="Timezone"
              value={propertyForm.timezone}
              onChange={(e) => setPropertyForm((prev) => ({ ...prev, timezone: e.target.value }))}
            />
            <input
              placeholder="Currency"
              value={propertyForm.currency}
              onChange={(e) => setPropertyForm((prev) => ({ ...prev, currency: e.target.value }))}
            />
            {selectedPropertyId && <StatusBadge status="healthy" />}
            <button
              type="button"
              onClick={() =>
                runStep(async () => ({
                  session: await setupProperty({
                    ...propertyForm,
                    property_code: propertyForm.property_name
                      .trim()
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-+|-+$/g, ""),
                  }),
                }))
              }
            >
              Salva property
            </button>
          </div>
        </AppCard>

        <AppCard>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Step 2 · Units</h3>
          <textarea
            rows={3}
            value={unitsInput}
            onChange={(e) => setUnitsInput(e.target.value)}
            placeholder="Unit A, Unit B, Unit C"
            style={{ width: "100%" }}
          />
          <button
            type="button"
            style={{ marginTop: 8 }}
            onClick={() =>
              runStep(async () => ({
                session: await setupUnits({
                  units: unitsInput
                    .split(",")
                    .map((u) => u.trim())
                    .filter(Boolean),
                }),
              }))
            }
          >
            Crea units
          </button>
        </AppCard>

        <AppCard>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Step 3 · Connect Provider</h3>
          <select
            value={providerForm.provider}
            onChange={(e) => setProviderForm((prev) => ({ ...prev, provider: e.target.value }))}
          >
            <option value="mock">mock</option>
            <option value="home_assistant">home_assistant</option>
          </select>
          <button
            type="button"
            style={{ marginTop: 8 }}
            onClick={() =>
              runStep(async () => ({
                session: await setupConnectProvider({
                  ...providerForm,
                  property_id: selectedPropertyId ? Number(selectedPropertyId) : undefined,
                }),
              }))
            }
          >
            Connetti provider
          </button>
          {propertyScopedConnections.length > 0 ? (
            <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
              Connections: {propertyScopedConnections.map((c) => `#${c.id}:${c.provider_name}`).join(", ")}
            </div>
          ) : null}
        </AppCard>

        <AppCard>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Step 4 · Import Devices</h3>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Importa catalogo dal provider selezionato nello step precedente.
          </p>
          <button
            type="button"
            onClick={() =>
              runStep(async () => ({
                session: await setupImportDevices({
                  property_id: selectedPropertyId ? Number(selectedPropertyId) : undefined,
                  provider_connection_id: selectedConnectionId ? Number(selectedConnectionId) : undefined,
                }),
              }))
            }
          >
            Importa dispositivi
          </button>
          {metadata.import_result ? (
            <div style={{ marginTop: 8, fontSize: 13, color: "#374151" }}>
              Importati: {metadata.import_result.imported_devices} · Aggiornati: {metadata.import_result.updated_devices}
            </div>
          ) : null}
        </AppCard>

        <AppCard>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Step 5 · Assign Devices to Units</h3>
          {importedDevices.length === 0 ? (
            <EmptyState title="Nessun dispositivo importato" />
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {importedDevices.map((device) => (
                <div key={device.id} style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 8, alignItems: "center" }}>
                  <div style={{ fontSize: 13 }}>
                    {device.name} <span style={{ color: "#6b7280" }}>({device.external_id})</span>
                  </div>
                  <select
                    value={assignments[device.id] || device.unit_id || ""}
                    onChange={(e) => setAssignments((prev) => ({ ...prev, [device.id]: e.target.value }))}
                  >
                    <option value="">Non assegnato</option>
                    {propertyScopedUnits.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            style={{ marginTop: 8 }}
            onClick={() =>
              runStep(async () => ({
                session: await setupAssignDevices({
                  property_id: selectedPropertyId ? Number(selectedPropertyId) : undefined,
                  assignments: Object.entries(assignments)
                    .filter(([, unitId]) => unitId)
                    .map(([deviceId, mappedUnitId]) => ({
                      device_id: Number(deviceId),
                      unit_id: Number(mappedUnitId),
                    })),
                }),
              }))
            }
          >
            Salva mapping
          </button>
        </AppCard>

        <AppCard>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Step 6 · Enable Automations</h3>
          <div style={{ display: "grid", gap: 6 }}>
            {["basic_hospitality_pack", "energy_saver_pack", "leak_protection_pack"].map((tpl) => (
              <label key={tpl} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={templates.includes(tpl)}
                  onChange={(e) =>
                    setTemplates((prev) =>
                      e.target.checked ? [...new Set([...prev, tpl])] : prev.filter((x) => x !== tpl)
                    )
                  }
                />
                <span>{tpl}</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            style={{ marginTop: 8 }}
            onClick={() =>
              runStep(async () => ({
                session: await setupEnableAutomations({
                  property_id: selectedPropertyId ? Number(selectedPropertyId) : undefined,
                  templates,
                }),
              }))
            }
          >
            Abilita templates
          </button>
        </AppCard>

        <AppCard>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Step 7 · Finish</h3>
          <button type="button" onClick={() => runStep(async () => ({ session: await setupComplete() }))}>
            Completa setup
          </button>
          {session?.status === "completed" ? (
            <p style={{ color: "#065f46", marginTop: 8 }}>
              Setup completato. Puoi riprendere il wizard in qualsiasi momento da questa pagina.
            </p>
          ) : null}
        </AppCard>
      </div>

      {properties.length > 0 ? (
        <AppCard style={{ marginTop: 12 }}>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Properties disponibili</h3>
          <div style={{ display: "grid", gap: 6 }}>
            {properties.map((p) => (
              <div key={p.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
                #{p.id} {p.name} ({p.code})
              </div>
            ))}
          </div>
        </AppCard>
      ) : null}
    </div>
  );
}

export default SetupWizard;

