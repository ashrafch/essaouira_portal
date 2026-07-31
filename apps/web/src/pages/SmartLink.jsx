import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, Save, XCircle } from "lucide-react";
import {
  ActionToolbar,
  AppCard,
  Button,
  EmptyState,
  LoadingSkeleton,
  SectionHeader,
  StatCard,
  useToast,
} from "../components/ui";
import {
  getSmartLinkStatus,
  getSmartLinkZoneMap,
  getUnits,
  reconcileSmartLink,
  syncSmartProvider,
  updateSmartLinkZoneMap,
} from "../services/api";

const KIND_LABEL = {
  unit: "Unita affittabile",
  facility: "Impianto condiviso",
  common: "Servizio di sito",
};

function Indicator({ ok, label, hint }) {
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Icon
        size={16}
        color={ok ? "var(--color-success-strong)" : "var(--color-danger-strong)"}
      />
      <span style={{ fontWeight: 600 }}>{label}</span>
      {hint ? (
        <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{hint}</span>
      ) : null}
    </div>
  );
}

/**
 * Operator view of the building link.
 *
 * The important part is the drift list: after a VillaCore milestone lands, the
 * entities the portal does not understand yet show up here as a to-do instead of
 * silently missing from the rest of the app.
 */
function SmartLink() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null);
  const [zoneMap, setZoneMap] = useState({});
  const [units, setUnits] = useState([]);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [statusData, zoneData, unitData] = await Promise.all([
        getSmartLinkStatus(),
        getSmartLinkZoneMap().catch(() => ({})),
        getUnits().catch(() => []),
      ]);
      setStatus(statusData);
      setZoneMap(zoneData || {});
      setUnits(unitData || []);
      setDraft({});
    } catch (err) {
      setError(err.message || "Errore caricamento stato link");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unitZones = useMemo(
    () =>
      Object.values(zoneMap)
        .filter((entry) => entry.kind === "unit")
        .sort((a, b) => a.zone.localeCompare(b.zone)),
    [zoneMap]
  );

  const otherZones = useMemo(
    () =>
      Object.values(zoneMap)
        .filter((entry) => entry.kind !== "unit")
        .sort((a, b) => a.zone.localeCompare(b.zone)),
    [zoneMap]
  );

  async function runAction(kind) {
    setBusy(kind);
    try {
      if (kind === "sync") {
        const result = await syncSmartProvider(status?.provider_name);
        toast.success(
          `Sync: ${result.imported_devices} importati, ${result.updated_devices} aggiornati`
        );
      } else {
        const result = await reconcileSmartLink(status?.provider_name);
        toast.success(
          `Riconciliazione: ${result.updated_states} stati aggiornati, ${result.errors} errori`
        );
      }
      await load();
    } catch (err) {
      toast.error(err.message || "Operazione non riuscita");
    } finally {
      setBusy("");
    }
  }

  async function saveZoneMap() {
    if (!status?.connection_id) {
      toast.error("Nessuna provider connection: creala dalla pagina Proprieta.");
      return;
    }
    setBusy("zone-map");
    try {
      const payload = {};
      Object.values(zoneMap).forEach((entry) => {
        const nextUnitId =
          draft[entry.zone] !== undefined ? draft[entry.zone] : entry.unit_id;
        if (entry.kind === "unit" && nextUnitId) {
          payload[entry.zone] = { kind: "unit", unit_id: Number(nextUnitId) };
        } else if (entry.kind !== "unit") {
          payload[entry.zone] = { kind: entry.kind };
        }
      });
      await updateSmartLinkZoneMap(status.connection_id, payload);
      toast.success("Mappa zone salvata");
      await load();
    } catch (err) {
      toast.error(err.message || "Salvataggio non riuscito");
    } finally {
      setBusy("");
    }
  }

  return (
    <div>
      <SectionHeader
        title="Link VillaCore"
        subtitle="Stato del collegamento con l'edificio, mappatura zone e entita non ancora classificate"
      />

      <ActionToolbar>
        <Button
          variant="secondary"
          icon={<RefreshCw size={14} />}
          onClick={load}
          loading={loading}
        >
          Ricarica
        </Button>
        <Button
          variant="primary"
          onClick={() => runAction("sync")}
          loading={busy === "sync"}
          disabled={!status?.reachable}
        >
          Sincronizza catalogo
        </Button>
        <Button
          variant="secondary"
          onClick={() => runAction("reconcile")}
          loading={busy === "reconcile"}
          disabled={!status?.reachable}
        >
          Riconcilia stati
        </Button>
      </ActionToolbar>

      {loading ? <LoadingSkeleton rows={6} height={36} /> : null}
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}

      {!loading && !error && status ? (
        <>
          <AppCard style={{ marginBottom: 12 }}>
            <div style={{ display: "grid", gap: 10 }}>
              <Indicator
                ok={status.configured}
                label="Configurazione"
                hint={status.configured ? "URL e token presenti" : "HOME_ASSISTANT_URL / TOKEN mancanti"}
              />
              <Indicator
                ok={status.reachable}
                label="Raggiungibilita"
                hint={status.reachable ? "Home Assistant risponde" : "Host non raggiungibile"}
              />
              <Indicator
                ok={status.authenticated}
                label="Autenticazione"
                hint={
                  status.authenticated
                    ? "Token accettato"
                    : "Token rifiutato: probabilmente appartiene a un'altra istanza"
                }
              />
              <Indicator
                ok={status.manifest_present}
                label="Manifest VillaCore"
                hint={
                  status.manifest_present
                    ? `Contratto ${status.contract_version}`
                    : `Assente: il portale usa il profilo interno (${status.contract_version})`
                }
              />
              <Indicator
                ok={status.ingest_push_enabled}
                label="Push eventi"
                hint={
                  status.ingest_push_enabled
                    ? "SMART_INGEST_TOKEN configurato"
                    : "Disattivato: il portale legge solo in polling"
                }
              />
              <Indicator
                ok={status.poll_interval_seconds > 0}
                label="Riconciliazione automatica"
                hint={
                  status.poll_interval_seconds > 0
                    ? `Ogni ${status.poll_interval_seconds}s`
                    : "Spenta: usa il pulsante Riconcilia o un cron"
                }
              />
            </div>
            {status.last_error ? (
              <p
                style={{
                  marginTop: 10,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "var(--color-danger-soft)",
                  border: "1px solid var(--color-danger)",
                  fontSize: 13,
                }}
              >
                {status.last_error}
              </p>
            ) : null}
          </AppCard>

          <div className="ui-grid-cards" style={{ marginBottom: 12 }}>
            <StatCard label="Entita in Home Assistant" value={status.entity_count} />
            <StatCard label="Importabili" value={status.importable_count} tone="info" />
            <StatCard label="Escluse (automazioni, simulazione)" value={status.excluded_count} />
            <StatCard label="Device nel portale" value={status.imported_device_count} tone="success" />
            <StatCard
              label="Da importare"
              value={status.pending_import_count}
              tone={status.pending_import_count ? "warning" : "success"}
            />
            <StatCard
              label="Non classificate"
              value={status.unclassified_count}
              tone={status.unclassified_count ? "warning" : "success"}
            />
          </div>

          <AppCard style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>Entita non classificate</h3>
            {status.unclassified?.length ? (
              <>
                <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                  Il portale le vede ma non sa che ruolo abbiano. Succede tipicamente dopo una nuova
                  milestone di VillaCore: aggiungi una regola in{" "}
                  <code>providers/villacore_profile.yaml</code> oppure dichiarale nel manifest.
                </p>
                <div style={{ display: "grid", gap: 6 }}>
                  {status.unclassified.map((item) => (
                    <div
                      key={item.entity_id}
                      style={{
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        padding: "6px 10px",
                        fontSize: 13,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <code>{item.entity_id}</code>
                      <span style={{ color: "var(--color-text-muted)" }}>
                        zona {item.zone || "?"} · {item.reason}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState
                title="Tutto classificato"
                description="Ogni entita esposta da VillaCore ha una zona e una capability."
              />
            )}
          </AppCard>

          <AppCard>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <h3 style={{ margin: 0 }}>Mappa zone</h3>
              <Button
                variant="primary"
                size="sm"
                icon={<Save size={14} />}
                onClick={saveZoneMap}
                loading={busy === "zone-map"}
                disabled={!status.connection_id}
                title={
                  status.connection_id
                    ? "Salva le associazioni zona - unita"
                    : "Serve una provider connection VillaCore"
                }
              >
                Salva
              </Button>
            </div>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
              Associa le zone di VillaCore alle unita del PMS. Le zone impianto non hanno unita:
              vivono nella pagina Impianti.
            </p>

            {unitZones.length === 0 ? (
              <EmptyState title="Nessuna zona unita" description="Esegui una sincronizzazione." />
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {unitZones.map((entry) => (
                  <div
                    key={entry.zone}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      padding: "8px 10px",
                    }}
                  >
                    <code style={{ minWidth: 70 }}>{entry.zone}</code>
                    <span style={{ flex: 1, minWidth: 140 }}>{entry.display_name}</span>
                    <select
                      value={
                        draft[entry.zone] !== undefined
                          ? draft[entry.zone]
                          : entry.unit_id || ""
                      }
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, [entry.zone]: event.target.value }))
                      }
                      aria-label={`Unita per la zona ${entry.zone}`}
                    >
                      <option value="">Non associata</option>
                      {units.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name}
                        </option>
                      ))}
                    </select>
                    <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                      {entry.source === "override" ? "impostata a mano" : "dal profilo"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {otherZones.length ? (
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "0 0 6px" }}>
                  Altre zone
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {otherZones.map((entry) => (
                    <span
                      key={entry.zone}
                      style={{
                        border: "1px solid var(--color-border)",
                        borderRadius: 999,
                        padding: "2px 10px",
                        fontSize: 12,
                        background: "var(--color-surface-soft)",
                      }}
                      title={KIND_LABEL[entry.kind] || entry.kind}
                    >
                      {entry.display_name} · {KIND_LABEL[entry.kind] || entry.kind}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </AppCard>
        </>
      ) : null}

      {!loading && !error && !status ? (
        <EmptyState
          title="Link non configurato"
          description="Imposta SMART_PROVIDER_MODE=villacore e le variabili HOME_ASSISTANT_* nel file .env."
        />
      ) : null}
    </div>
  );
}

export default SmartLink;
