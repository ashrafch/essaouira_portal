import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Plus, RefreshCw, RotateCcw, XCircle } from "lucide-react";
import {
  AppCard,
  Button,
  EmptyState,
  LoadingSkeleton,
  Modal,
  SectionHeader,
  StatCard,
  useToast,
} from "../components/ui";
import WizardProgress from "../components/setup/WizardProgress";
import WizardStep from "../components/setup/WizardStep";
import ZoneMappingTable from "../components/setup/ZoneMappingTable";
import {
  getProperties,
  getSetupSession,
  getSmartLinkStatus,
  getUnits,
  setupComplete,
  setupConnectProvider,
  setupEnableAutomations,
  setupImportDevices,
  setupMapZones,
  setupProperty,
  setupRestart,
  setupStart,
  setupUnits,
  setupZoneSuggestions,
} from "../services/api";

const STEPS = [
  { key: "property", label: "Proprietà" },
  { key: "units", label: "Unità" },
  { key: "connect_provider", label: "Edificio" },
  { key: "import_devices", label: "Scoperta" },
  { key: "map_zones", label: "Mappatura" },
  { key: "enable_automations", label: "Automazioni" },
  { key: "complete", label: "Fine" },
];

const PROVIDERS = [
  {
    value: "villacore",
    label: "VillaCore",
    description:
      "Il progetto domotico della proprietà: espone zone, workflow di check-in/out e impianti. È la scelta giusta se hai lo stack VillaCore in esecuzione.",
  },
  {
    value: "home_assistant",
    label: "Home Assistant generico",
    description:
      "Un'istanza Home Assistant qualsiasi. Importa le entità ma non conosce zone, workflow né impianti.",
  },
  {
    value: "mock",
    label: "Simulato (mock)",
    description:
      "Dispositivi finti per provare il portale senza edificio collegato. Nessun dato reale.",
  },
];

const PACKS = [
  {
    key: "basic_hospitality_pack",
    label: "Hospitality di base",
    description: "Reazioni smart al check-in e al check-out, con visibilità operativa.",
  },
  {
    key: "energy_saver_pack",
    label: "Risparmio energetico",
    description: "Riduzione dei consumi quando l'unità si libera.",
  },
  {
    key: "leak_protection_pack",
    label: "Protezione perdite",
    description: "Una perdita d'acqua apre un ticket di manutenzione.",
  },
];

function stepIndex(key) {
  const index = STEPS.findIndex((step) => step.key === key);
  return index < 0 ? 0 : index;
}

/**
 * Guided onboarding.
 *
 * Every step states what it will do before doing it, and the mapping step binds
 * whole building zones to units instead of devices one by one — the previous
 * version made it far too easy to attach an entire building to one apartment,
 * and to create a duplicate property by retyping its name.
 */
function SetupWizard() {
  const toast = useToast();
  const [session, setSession] = useState(null);
  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [linkStatus, setLinkStatus] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const [propertyMode, setPropertyMode] = useState("existing");
  const [propertyId, setPropertyId] = useState("");
  const [propertyForm, setPropertyForm] = useState({
    property_name: "",
    timezone: "Africa/Casablanca",
    currency: "EUR",
  });
  const [newUnits, setNewUnits] = useState("");
  const [provider, setProvider] = useState("villacore");
  const [baseUrl, setBaseUrl] = useState("http://home-assistant:8123");
  const [zoneMap, setZoneMap] = useState({});
  const [packs, setPacks] = useState(["basic_hospitality_pack"]);
  const [confirmRestart, setConfirmRestart] = useState(false);

  const metadata = session?.metadata || {};
  const currentStep = session?.current_step || "property";
  const isCompleted = session?.status === "completed";
  const activeIndex = stepIndex(currentStep);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [sessionData, propertyData, unitData] = await Promise.all([
        getSetupSession().catch(() => null),
        getProperties().catch(() => []),
        getUnits().catch(() => []),
      ]);
      setSession(sessionData);
      setProperties(propertyData || []);
      setUnits(unitData || []);

      const boundProperty = sessionData?.metadata?.property_id;
      if (boundProperty) {
        setPropertyId(String(boundProperty));
      } else if ((propertyData || []).length === 1) {
        setPropertyId(String(propertyData[0].id));
      }
      // On a fresh install there is nothing to reuse, so start on "create new":
      // defaulting to the existing-property choice would be a dead end.
      setPropertyMode((propertyData || []).length ? "existing" : "new");

      const step = sessionData?.current_step;
      if (step && stepIndex(step) >= stepIndex("connect_provider")) {
        setLinkStatus(await getSmartLinkStatus().catch(() => null));
      }
      if (step && stepIndex(step) >= stepIndex("map_zones")) {
        const zoneData = await setupZoneSuggestions().catch(() => null);
        setSuggestions(zoneData);
        if (zoneData?.zones) {
          setZoneMap(
            Object.fromEntries(
              zoneData.zones
                .filter((zone) => zone.kind === "unit")
                .map((zone) => [
                  zone.zone,
                  zone.unit_id || zone.suggested_unit_id
                    ? String(zone.unit_id || zone.suggested_unit_id)
                    : "",
                ])
            )
          );
        }
      }
    } catch (err) {
      setError(err.message || "Errore caricamento wizard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runStep = useCallback(
    async (key, action, successMessage) => {
      setBusy(key);
      setError("");
      try {
        await action();
        if (successMessage) toast.success(successMessage);
        await load();
      } catch (err) {
        setError(err.message || "Passo non completato");
        toast.error(err.message || "Passo non completato");
      } finally {
        setBusy("");
      }
    },
    [load, toast]
  );

  const missingUnits = useMemo(() => {
    const existing = new Set(units.map((unit) => unit.name.trim().toLowerCase()));
    return newUnits
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name && !existing.has(name.toLowerCase()));
  }, [newUnits, units]);

  const unitZonesToMap = useMemo(
    () => (suggestions?.zones || []).filter((zone) => zone.kind === "unit"),
    [suggestions]
  );

  const mappedCount = useMemo(
    () => Object.values(zoneMap).filter(Boolean).length,
    [zoneMap]
  );

  if (loading) {
    return (
      <div>
        <SectionHeader title="Setup guidato" subtitle="Caricamento…" />
        <LoadingSkeleton rows={6} height={40} />
      </div>
    );
  }

  if (!session) {
    return (
      <div>
        <SectionHeader
          title="Setup guidato"
          subtitle="Collega il portale all'edificio in sette passi, spiegati uno per uno"
        />
        <AppCard>
          <h3 style={{ marginTop: 0 }}>Cosa farà questa procedura</h3>
          <ol style={{ fontSize: 14, lineHeight: 1.7, paddingLeft: 20 }}>
            <li>
              <strong>Proprietà</strong>: quale immobile stai gestendo. Puoi usare quella esistente
              invece di crearne una nuova.
            </li>
            <li>
              <strong>Unità</strong>: cosa affitti. Le prenotazioni si attaccano a queste.
            </li>
            <li>
              <strong>Edificio</strong>: a quale sistema domotico collegarsi.
            </li>
            <li>
              <strong>Scoperta</strong>: il portale legge cosa espone l&apos;edificio.
            </li>
            <li>
              <strong>Mappatura</strong>: quale zona dell&apos;edificio corrisponde a quale unità.
            </li>
            <li>
              <strong>Automazioni</strong>: quali reazioni attivare.
            </li>
            <li>
              <strong>Fine</strong>: riepilogo di ciò che è stato collegato.
            </li>
          </ol>
          <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            Nessun passo cancella dati. Puoi interrompere e riprendere: la procedura ricorda dove
            eri arrivato.
          </p>
          <Button
            variant="primary"
            loading={busy === "start"}
            onClick={() => runStep("start", setupStart, "Procedura avviata")}
          >
            Inizia
          </Button>
        </AppCard>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader
        title="Setup guidato"
        subtitle="Ogni passo spiega cosa fa prima di farlo. Puoi interromperti e riprendere."
        right={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={load}>
              Ricarica
            </Button>
            <Button
              variant="ghost"
              icon={<RotateCcw size={14} />}
              onClick={() => setConfirmRestart(true)}
            >
              Riavvia procedura
            </Button>
          </div>
        }
      />

      <WizardProgress steps={STEPS} currentKey={currentStep} completed={isCompleted} />

      <Modal
        open={confirmRestart}
        onClose={() => setConfirmRestart(false)}
        title="Riavviare la procedura?"
        description="Utile se ti sei perso o hai fatto una scelta sbagliata."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRestart(false)}>
              Annulla
            </Button>
            <Button
              variant="primary"
              loading={busy === "restart"}
              onClick={() => {
                setConfirmRestart(false);
                return runStep("restart", setupRestart, "Procedura riavviata dal primo passo");
              }}
            >
              Riavvia
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          Si riparte dal primo passo. <strong>Non viene cancellato niente</strong>: proprietà,
          unità, dispositivi e mappature restano come sono, e i passi già corretti si confermano in
          un clic.
        </p>
      </Modal>

      {error ? (
        <AppCard style={{ marginBottom: 12, borderColor: "var(--color-danger)" }}>
          <p style={{ margin: 0, color: "var(--color-danger-strong)" }}>{error}</p>
        </AppCard>
      ) : null}

      {/* 1 — Property */}
      <WizardStep
        index={1}
        title="Proprietà"
        subtitle="L'immobile fisico che stai gestendo"
        active={currentStep === "property"}
        done={activeIndex > 0 || isCompleted}
        explanation={
          <>
            Una <strong>proprietà</strong> è l&apos;immobile nel suo insieme: la villa con i suoi
            appartamenti e le aree comuni. Ne serve una sola. Se ne esiste già una,{" "}
            <strong>selezionala</strong>: scrivere un nome diverso ne crea una seconda e i
            dispositivi finirebbero divisi tra le due.
          </>
        }
      >
        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <input
              type="radio"
              checked={propertyMode === "existing"}
              onChange={() => setPropertyMode("existing")}
              disabled={properties.length === 0}
            />
            Usa una proprietà esistente
          </label>
          {propertyMode === "existing" ? (
            properties.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
                Nessuna proprietà esistente: creane una qui sotto.
              </p>
            ) : (
              <select
                value={propertyId}
                onChange={(event) => setPropertyId(event.target.value)}
                aria-label="Proprietà esistente"
                style={{ maxWidth: 380 }}
              >
                <option value="">Seleziona…</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            )
          ) : null}

          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <input
              type="radio"
              checked={propertyMode === "new"}
              onChange={() => setPropertyMode("new")}
            />
            Crea una nuova proprietà
          </label>
          {propertyMode === "new" ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                placeholder="Nome della proprietà"
                value={propertyForm.property_name}
                onChange={(event) =>
                  setPropertyForm((prev) => ({ ...prev, property_name: event.target.value }))
                }
                style={{ minWidth: 240 }}
              />
              <input
                placeholder="Timezone"
                value={propertyForm.timezone}
                onChange={(event) =>
                  setPropertyForm((prev) => ({ ...prev, timezone: event.target.value }))
                }
              />
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: 12 }}>
          <Button
            variant="primary"
            loading={busy === "property"}
            disabled={
              propertyMode === "existing"
                ? !propertyId
                : !propertyForm.property_name.trim()
            }
            onClick={() => {
              const selected = properties.find((p) => String(p.id) === String(propertyId));
              const payload =
                propertyMode === "existing" && selected
                  ? {
                      property_name: selected.name,
                      timezone: selected.timezone || "Africa/Casablanca",
                    }
                  : propertyForm;
              return runStep("property", () => setupProperty(payload), "Proprietà confermata");
            }}
          >
            {propertyMode === "existing" ? "Usa questa proprietà" : "Crea proprietà"}
          </Button>
        </div>
      </WizardStep>

      {/* 2 — Units */}
      <WizardStep
        index={2}
        title="Unità affittabili"
        subtitle="Cosa affitti: villa e appartamenti"
        active={currentStep === "units"}
        done={activeIndex > 1 || isCompleted}
        locked={activeIndex < 1}
        lockedReason="Conferma prima la proprietà."
        explanation={
          <>
            Un&apos;<strong>unità</strong> è ciò che prenoti e fatturi. Le unità esistenti restano
            come sono: qui puoi solo <strong>aggiungerne</strong> di mancanti. Se l&apos;edificio
            espone una zona <code>villa</code> ti servirà anche un&apos;unità per la villa, altrimenti
            i suoi dispositivi resteranno a livello di proprietà.
          </>
        }
        note="Le unità non vengono mai cancellate da questa procedura."
      >
        <p style={{ fontSize: 13, margin: "0 0 8px" }}>
          Unità già presenti ({units.length}):{" "}
          {units.length ? (
            units.map((unit) => unit.name).join(" · ")
          ) : (
            <em>nessuna</em>
          )}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            placeholder="Nuove unità separate da virgola, es. Villa"
            value={newUnits}
            onChange={(event) => setNewUnits(event.target.value)}
            style={{ minWidth: 300 }}
          />
          <Button
            variant={missingUnits.length ? "primary" : "secondary"}
            icon={<Plus size={14} />}
            loading={busy === "units"}
            onClick={() =>
              runStep(
                "units",
                () => setupUnits({ units: missingUnits }),
                missingUnits.length
                  ? `Aggiunte ${missingUnits.length} unità`
                  : "Nessuna unità da aggiungere, passo confermato"
              )
            }
          >
            {missingUnits.length
              ? `Aggiungi ${missingUnits.length} e continua`
              : "Continua senza aggiungere"}
          </Button>
        </div>
        {missingUnits.length ? (
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 6 }}>
            Verranno create: {missingUnits.join(", ")}
          </p>
        ) : null}
      </WizardStep>

      {/* 3 — Building */}
      <WizardStep
        index={3}
        title="Collega l'edificio"
        subtitle="Da dove arrivano dispositivi e stati"
        active={currentStep === "connect_provider"}
        done={activeIndex > 2 || isCompleted}
        locked={activeIndex < 2}
        lockedReason="Conferma prima le unità."
        explanation={
          <>
            Il portale non controlla l&apos;edificio: gli <strong>chiede</strong> le informazioni e
            gli invia richieste. Le protezioni fisiche e gli interblocchi restano dove sono. Con
            VillaCore serve anche un token, generato con{" "}
            <code>python scripts/get_villacore_token.py</code>.
          </>
        }
      >
        <div style={{ display: "grid", gap: 8 }}>
          {PROVIDERS.map((option) => (
            <label
              key={option.value}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                border: `1px solid ${
                  provider === option.value ? "var(--color-primary)" : "var(--color-border)"
                }`,
                borderRadius: 8,
                padding: "8px 10px",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                checked={provider === option.value}
                onChange={() => setProvider(option.value)}
                style={{ marginTop: 3 }}
              />
              <span>
                <strong style={{ fontSize: 14 }}>{option.label}</strong>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  {option.description}
                </div>
              </span>
            </label>
          ))}
          {provider !== "mock" ? (
            <input
              placeholder="Base URL"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              style={{ maxWidth: 380 }}
            />
          ) : null}
        </div>

        {linkStatus ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10, fontSize: 13 }}>
            {[
              ["Raggiungibile", linkStatus.reachable],
              ["Autenticato", linkStatus.authenticated],
            ].map(([label, ok]) => (
              <span key={label} style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                {ok ? (
                  <CheckCircle2 size={14} color="var(--color-success-strong)" />
                ) : (
                  <XCircle size={14} color="var(--color-danger-strong)" />
                )}
                {label}
              </span>
            ))}
            {linkStatus.last_error ? (
              <span style={{ color: "var(--color-danger-strong)" }}>{linkStatus.last_error}</span>
            ) : null}
          </div>
        ) : null}

        <div style={{ marginTop: 12 }}>
          <Button
            variant="primary"
            loading={busy === "connect_provider"}
            onClick={() =>
              runStep(
                "connect_provider",
                () =>
                  setupConnectProvider({
                    provider,
                    config: provider === "mock" ? {} : { base_url: baseUrl.trim() },
                  }),
                "Edificio collegato"
              )
            }
          >
            Collega
          </Button>
        </div>
      </WizardStep>

      {/* 4 — Discovery */}
      <WizardStep
        index={4}
        title="Scopri cosa espone l'edificio"
        subtitle="Lettura del catalogo, nessuna modifica"
        active={currentStep === "import_devices"}
        done={activeIndex > 3 || isCompleted}
        locked={activeIndex < 3}
        lockedReason="Collega prima l'edificio."
        explanation={
          <>
            Il portale legge le entità e le classifica in <strong>zone</strong> e{" "}
            <strong>capability</strong>. Automazioni e helper di simulazione vengono{" "}
            <strong>esclusi</strong>: non sono dispositivi. Questa operazione è di sola lettura e
            puoi ripeterla quando vuoi.
          </>
        }
      >
        {metadata.import_result ? (
          <div className="ui-grid-cards" style={{ marginBottom: 10 }}>
            <StatCard label="Importati" value={metadata.import_result.imported_devices ?? 0} tone="success" />
            <StatCard label="Aggiornati" value={metadata.import_result.updated_devices ?? 0} tone="info" />
            <StatCard label="Stati letti" value={metadata.import_result.synced_states ?? 0} />
          </div>
        ) : null}
        <Button
          variant="primary"
          loading={busy === "import_devices"}
          onClick={() =>
            runStep("import_devices", () => setupImportDevices({}), "Catalogo importato")
          }
        >
          {metadata.import_result ? "Ripeti la scoperta" : "Scopri i dispositivi"}
        </Button>
      </WizardStep>

      {/* 5 — Zone mapping */}
      <WizardStep
        index={5}
        title="Mappa le zone sulle unità"
        subtitle="Il passo che collega edificio e prenotazioni"
        active={currentStep === "map_zones"}
        done={activeIndex > 4 || isCompleted}
        locked={activeIndex < 4}
        lockedReason="Esegui prima la scoperta dei dispositivi."
        explanation={
          <>
            L&apos;edificio ragiona per <strong>zone</strong> (<code>a1</code>, <code>villa</code>,{" "}
            <code>pool</code>), il PMS per <strong>unità</strong>. Qui dici quale zona è quale unità:
            una sola scelta collega tutti i suoi dispositivi. Gli <strong>impianti</strong> (piscina,
            irrigazione, cancello) non si collegano a un&apos;unità perché sono aree comuni.
          </>
        }
        note="Il portale non indovina: nessuna zona viene collegata da sola a un'unità."
      >
        {suggestions ? (
          <>
            <ZoneMappingTable
              zones={suggestions.zones}
              units={suggestions.units}
              value={zoneMap}
              onChange={(zone, unitId) =>
                setZoneMap((prev) => ({ ...prev, [zone]: unitId }))
              }
            />
            <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Button
                variant="primary"
                loading={busy === "map_zones"}
                onClick={() =>
                  runStep(
                    "map_zones",
                    () =>
                      setupMapZones({
                        zone_map: Object.fromEntries(
                          Object.entries(zoneMap)
                            .filter(([, unitId]) => unitId)
                            .map(([zone, unitId]) => [zone, Number(unitId)])
                        ),
                      }),
                    "Mappatura salvata e dispositivi ricollegati"
                  )
                }
              >
                Salva mappatura ({mappedCount}/{unitZonesToMap.length})
              </Button>
              {mappedCount < unitZonesToMap.length ? (
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  Le zone non collegate resteranno visibili a livello di proprietà.
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <EmptyState
            title="Nessuna zona da mappare"
            description="Esegui il passo di scoperta, poi ricarica."
          />
        )}
      </WizardStep>

      {/* 6 — Automations */}
      <WizardStep
        index={6}
        title="Attiva le automazioni"
        subtitle="Reazioni pronte, disattivabili in seguito"
        active={currentStep === "enable_automations"}
        done={activeIndex > 5 || isCompleted}
        locked={activeIndex < 5}
        lockedReason="Salva prima la mappatura delle zone."
        explanation={
          <>
            Sono <strong>reazioni del portale</strong> agli eventi (arrivo, partenza, perdita
            d&apos;acqua): creano alert e ticket. Non comandano l&apos;edificio al posto delle sue
            automazioni di sicurezza. L&apos;attivazione è idempotente: ripeterla non duplica nulla.
          </>
        }
      >
        <div style={{ display: "grid", gap: 8 }}>
          {PACKS.map((pack) => (
            <label
              key={pack.key}
              style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14 }}
            >
              <input
                type="checkbox"
                checked={packs.includes(pack.key)}
                onChange={(event) =>
                  setPacks((prev) =>
                    event.target.checked
                      ? [...prev, pack.key]
                      : prev.filter((key) => key !== pack.key)
                  )
                }
                style={{ marginTop: 3 }}
              />
              <span>
                <strong>{pack.label}</strong>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  {pack.description}
                </div>
              </span>
            </label>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <Button
            variant="primary"
            loading={busy === "enable_automations"}
            disabled={packs.length === 0}
            onClick={() =>
              runStep(
                "enable_automations",
                () => setupEnableAutomations({ templates: packs }),
                "Automazioni attivate"
              )
            }
          >
            Attiva le selezionate
          </Button>
        </div>
      </WizardStep>

      {/* 7 — Done */}
      <WizardStep
        index={7}
        title="Riepilogo"
        subtitle="Cosa è collegato adesso"
        active={currentStep === "complete" && !isCompleted}
        done={isCompleted}
        locked={activeIndex < 6}
        lockedReason="Completa prima le automazioni."
        explanation={
          <>
            Da qui in poi il portale resta allineato da solo: risincronizza a intervalli e assorbe le
            nuove entità dell&apos;edificio. Se qualcosa non viene riconosciuto lo trovi elencato in{" "}
            <strong>Link VillaCore</strong>.
          </>
        }
      >
        <div className="ui-grid-cards" style={{ marginBottom: 10 }}>
          <StatCard label="Unità" value={units.length} />
          <StatCard
            label="Zone mappate"
            value={metadata.zone_map_result?.zones_mapped ?? mappedCount}
            tone="success"
          />
          <StatCard
            label="Dispositivi collegati"
            value={metadata.zone_map_result?.devices_bound ?? 0}
            tone="info"
          />
          <StatCard
            label="Non classificate"
            value={linkStatus?.unclassified_count ?? 0}
            tone={linkStatus?.unclassified_count ? "warning" : "success"}
          />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!isCompleted ? (
            <Button
              variant="primary"
              loading={busy === "complete"}
              onClick={() => runStep("complete", setupComplete, "Setup completato")}
            >
              Concludi
            </Button>
          ) : null}
          <Link to="/smart-link">
            <Button variant="secondary">Apri Link VillaCore</Button>
          </Link>
          <Link to="/smart-facilities">
            <Button variant="secondary">Impianti e aree comuni</Button>
          </Link>
        </div>
      </WizardStep>

      {isCompleted ? (
        <AppCard>
          <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-muted)" }}>
            Setup completato il{" "}
            {session.completed_at ? new Date(session.completed_at).toLocaleString("it-IT") : "—"}.
            Puoi rieseguire la procedura in qualunque momento: è idempotente e non cancella nulla.
          </p>
          <div style={{ marginTop: 10 }}>
            <Button
              variant="ghost"
              icon={<RotateCcw size={14} />}
              loading={busy === "start"}
              onClick={() => runStep("start", setupStart, "Nuova procedura avviata")}
            >
              Riesegui il setup
            </Button>
          </div>
        </AppCard>
      ) : null}
    </div>
  );
}

export default SetupWizard;
