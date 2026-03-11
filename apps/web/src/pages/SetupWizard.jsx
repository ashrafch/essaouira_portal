import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteProperty,
  getProperties,
  pollSmartProvider,
  getSetupSession,
  getSmartDevices,
  getSmartProviderConnections,
  syncSmartProvider,
  getUnits,
  setupAssignDevices,
  setupComplete,
  setupConnectProvider,
  setupEnableAutomations,
  setupImportDevices,
  setupProperty,
  setupStart,
  setupUnits,
  updateProperty,
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
  { key: "units", label: "Unità" },
  { key: "connect_provider", label: "Provider" },
  { key: "import_devices", label: "Dispositivi" },
  { key: "assign_devices", label: "Assegnazioni" },
  { key: "enable_automations", label: "Automazioni" },
  { key: "complete", label: "Fine" },
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
  const [editingPropertyId, setEditingPropertyId] = useState(null);
  const [syncingProvider, setSyncingProvider] = useState(false);

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
      setError(err.message || "Errore caricamento Setup Wizard");
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
      let updated;
      try {
        updated = await action();
      } catch (err) {
        // Recover from stale/no-active setup session by recreating it once.
        if ((err?.message || "").includes("Errore API 404")) {
          const restarted = await setupStart();
          setSession(restarted.session || restarted);
          updated = await action();
        } else {
          throw err;
        }
      }
      setSession(updated.session ? updated.session : updated);
      await refreshReferenceData();
      setSuccess("Step completato con successo.");
    } catch (err) {
      setError(err.message || "Errore step wizard");
    }
  }

  async function handleEditProperty(property) {
    setEditingPropertyId(property.id);
    setPropertyForm({
      property_name: property.name || "",
      timezone: property.timezone || "Africa/Casablanca",
      currency: "EUR",
    });
  }

  async function handleDeleteProperty(propertyId) {
    const confirmed = window.confirm(
      "Eliminare questa property? L'operazione e' bloccata se esistono unita o connessioni collegate.",
    );
    if (!confirmed) return;

    setError("");
    setSuccess("");
    try {
      await deleteProperty(propertyId);
      if (editingPropertyId === propertyId) {
        setEditingPropertyId(null);
      }
      await refreshReferenceData();
      setSuccess("Property eliminata.");
    } catch (err) {
      setError(err.message || "Errore eliminazione property");
    }
  }

  async function handlePropertySubmit() {
    const normalizedCode = propertyForm.property_name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (editingPropertyId) {
      setError("");
      setSuccess("");
      try {
        await updateProperty(editingPropertyId, {
          name: propertyForm.property_name,
          code: normalizedCode,
          timezone: propertyForm.timezone,
        });
        setEditingPropertyId(null);
        setPropertyForm((prev) => ({ ...prev, property_name: "", timezone: "Africa/Casablanca" }));
        await refreshReferenceData();
        setSuccess("Property aggiornata.");
      } catch (err) {
        setError(err.message || "Errore aggiornamento property");
      }
      return;
    }

    await runStep(async () => ({
      session: await setupProperty({
        ...propertyForm,
        property_code: normalizedCode,
      }),
    }));
  }

  async function handleSyncAllImportedDevices() {
    const provider = providerForm.provider || "home_assistant";
    setSyncingProvider(true);
    setError("");
    setSuccess("");
    try {
      await syncSmartProvider(provider);
      await pollSmartProvider(provider);
      await refreshReferenceData();
      setSuccess(`Sincronizzazione completata per provider ${provider}.`);
    } catch (err) {
      setError(err.message || "Errore sincronizzazione provider");
    } finally {
      setSyncingProvider(false);
    }
  }

  if (loading) return <LoadingSkeleton rows={9} height={26} />;

  return (
    <div>
      <SectionHeader
        title="Setup Wizard Smart Property"
        subtitle="Onboarding guidato e resumable: property, provider, dispositivi, mapping e pacchetti automazione"
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

      <div className="setup-wizard-grid">
        <AppCard>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Step 1 · Property</h3>
          <div style={{ display: "grid", gap: 8 }}>
            <input
              placeholder="Nome property"
              value={propertyForm.property_name}
              onChange={(e) => setPropertyForm((prev) => ({ ...prev, property_name: e.target.value }))}
            />
            <input
              placeholder="Timezone"
              value={propertyForm.timezone}
              onChange={(e) => setPropertyForm((prev) => ({ ...prev, timezone: e.target.value }))}
            />
            <input
              placeholder="Valuta"
              value={propertyForm.currency}
              onChange={(e) => setPropertyForm((prev) => ({ ...prev, currency: e.target.value }))}
            />
            {selectedPropertyId && <StatusBadge status="healthy" />}
            <button
              type="button"
              onClick={handlePropertySubmit}
            >
              {editingPropertyId ? "Aggiorna property" : "Salva property"}
            </button>
            {editingPropertyId ? (
              <button
                type="button"
                onClick={() => {
                  setEditingPropertyId(null);
                  setPropertyForm((prev) => ({ ...prev, property_name: "", timezone: "Africa/Casablanca" }));
                }}
              >
                Annulla modifica
              </button>
            ) : null}
          </div>
        </AppCard>

        <AppCard>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Step 2 · Unità</h3>
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
            Crea unità
          </button>
        </AppCard>

        <AppCard>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Step 3 · Connessione provider</h3>
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
              Connessioni attive: {propertyScopedConnections.map((c) => `#${c.id}:${c.provider_name}`).join(", ")}
            </div>
          ) : null}
        </AppCard>

        <AppCard>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Step 4 · Importazione dispositivi</h3>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Importa il catalogo dal provider selezionato nello step precedente.
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
          <button type="button" onClick={handleSyncAllImportedDevices} disabled={syncingProvider}>
            {syncingProvider ? "Sincronizzo..." : "Sync tutti i dispositivi importati"}
          </button>
          {metadata.import_result ? (
            <div style={{ marginTop: 8, fontSize: 13, color: "#374151" }}>
              Importati: {metadata.import_result.imported_devices} · Aggiornati: {metadata.import_result.updated_devices}
            </div>
          ) : null}
        </AppCard>

        <AppCard>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Step 5 · Assegna dispositivi alle unità</h3>
          {importedDevices.length === 0 ? (
            <EmptyState title="Nessun dispositivo importato" />
          ) : (
            <div className="setup-wizard-assignments-list">
              {importedDevices.map((device) => (
                <div key={device.id} className="setup-wizard-assignment-row">
                  <div className="setup-wizard-assignment-label">
                    {device.name} <span style={{ color: "#6b7280" }}>({device.external_id})</span>
                  </div>
                  <select
                    value={assignments[device.id] || device.unit_id || ""}
                    onChange={(e) => setAssignments((prev) => ({ ...prev, [device.id]: e.target.value }))}
                    className="setup-wizard-assignment-select"
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
            Salva assegnazioni
          </button>
        </AppCard>

        <AppCard>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Step 6 · Abilita pacchetti automazione</h3>
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
            Abilita pacchetti
          </button>
        </AppCard>

        <AppCard>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Step 7 · Completa setup</h3>
          <button
            type="button"
            onClick={() =>
              runStep(async () => {
                await setupComplete();
                const restarted = await setupStart();
                return { session: restarted.session || restarted };
              })
            }
          >
            Completa setup
          </button>
          <p style={{ color: "#065f46", marginTop: 8 }}>
            Alla conferma viene avviata automaticamente una nuova sessione wizard.
          </p>
        </AppCard>
      </div>

      {properties.length > 0 ? (
        <AppCard style={{ marginTop: 12 }}>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Property disponibili</h3>
          <div style={{ display: "grid", gap: 6 }}>
            {properties.map((p) => (
              <div key={p.id} className="setup-wizard-property-item">
                <div className="setup-wizard-property-header">
                  <div className="setup-wizard-property-title">
                    #{p.id} {p.name} ({p.code})
                  </div>
                  <div className="setup-wizard-property-actions">
                    <button type="button" onClick={() => handleEditProperty(p)}>
                      Modifica
                    </button>
                    <button type="button" onClick={() => handleDeleteProperty(p.id)}>
                      Elimina
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </AppCard>
      ) : null}
    </div>
  );
}

export default SetupWizard;

