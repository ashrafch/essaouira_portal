import { useEffect, useMemo, useState } from "react";
import {
  getSetupSession,
  getSmartDevices,
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
  const importedDeviceIds = metadata.imported_device_ids || [];

  const importedDevices = useMemo(() => {
    if (!Array.isArray(devices) || importedDeviceIds.length === 0) return [];
    const setIds = new Set(importedDeviceIds);
    return devices.filter((d) => setIds.has(d.id));
  }, [devices, importedDeviceIds]);

  async function refreshReferenceData() {
    const [unitsData, devicesData] = await Promise.all([getUnits(), getSmartDevices()]);
    setUnits(unitsData || []);
    setDevices(devicesData || []);
  }

  async function load() {
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
  }

  useEffect(() => {
    load();
  }, []);

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

  if (loading) return <p>Caricamento setup wizard...</p>;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Property Setup Wizard</h1>
      <p style={{ color: "#6b7280" }}>
        Flusso guidato e resumable per configurare property, provider, device mapping e automazioni.
      </p>
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      {success && <p style={{ color: "#065f46" }}>{success}</p>}

      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", marginBottom: 16 }}>
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
                background: isCurrent ? "#dbeafe" : done ? "#dcfce7" : "#fff",
              }}
            >
              <div style={{ fontSize: 12, color: "#6b7280" }}>Step {idx + 1}</div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{step.label}</div>
            </div>
          );
        })}
      </div>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12, marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Step 1 - Property</h3>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
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
        </div>
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            onClick={() =>
              runStep(async () => ({ session: await setupProperty(propertyForm) }))
            }
          >
            Salva property
          </button>
        </div>
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12, marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Step 2 - Units</h3>
        <textarea
          rows={3}
          value={unitsInput}
          onChange={(e) => setUnitsInput(e.target.value)}
          placeholder="Unit A, Unit B, Unit C"
          style={{ width: "100%" }}
        />
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
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
        </div>
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12, marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Step 3 - Connect Provider</h3>
        <select
          value={providerForm.provider}
          onChange={(e) => setProviderForm((prev) => ({ ...prev, provider: e.target.value }))}
        >
          <option value="mock">mock</option>
          <option value="home_assistant">home_assistant</option>
        </select>
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            onClick={() => runStep(async () => ({ session: await setupConnectProvider(providerForm) }))}
          >
            Connetti provider
          </button>
        </div>
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12, marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Step 4 - Import Devices</h3>
        <p style={{ fontSize: 13, color: "#6b7280" }}>
          Importa catalogo dal provider selezionato nel passo precedente.
        </p>
        <button
          type="button"
          onClick={() => runStep(async () => ({ session: await setupImportDevices({}) }))}
        >
          Importa dispositivi
        </button>
        {metadata.import_result && (
          <div style={{ marginTop: 8, fontSize: 13, color: "#374151" }}>
            Importati: {metadata.import_result.imported_devices} · Aggiornati: {metadata.import_result.updated_devices}
          </div>
        )}
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12, marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Step 5 - Assign Devices to Units</h3>
        {importedDevices.length === 0 ? (
          <p style={{ color: "#6b7280" }}>Nessun dispositivo importato da mappare.</p>
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
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            onClick={() =>
              runStep(async () => ({
                session: await setupAssignDevices({
                  assignments: Object.entries(assignments)
                    .filter(([, unitId]) => unitId)
                    .map(([deviceId, unitId]) => ({
                      device_id: Number(deviceId),
                      unit_id: Number(unitId),
                    })),
                }),
              }))
            }
          >
            Salva mapping
          </button>
        </div>
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12, marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Step 6 - Enable Recommended Automations</h3>
        <div style={{ display: "grid", gap: 6 }}>
          {[
            "basic_hospitality_pack",
            "energy_saver_pack",
            "leak_protection_pack",
          ].map((tpl) => (
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
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            onClick={() =>
              runStep(async () => ({
                session: await setupEnableAutomations({ templates }),
              }))
            }
          >
            Abilita templates
          </button>
        </div>
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Step 7 - Finish</h3>
        <button type="button" onClick={() => runStep(async () => ({ session: await setupComplete() }))}>
          Completa setup
        </button>
        {session?.status === "completed" && (
          <p style={{ color: "#065f46", marginTop: 8 }}>
            Setup completato con successo. Puoi riprendere il wizard in qualsiasi momento da questa pagina.
          </p>
        )}
      </section>
    </div>
  );
}

export default SetupWizard;
