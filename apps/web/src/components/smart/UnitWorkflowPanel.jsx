import { useCallback, useEffect, useState } from "react";
import { LogIn, LogOut, PowerOff, Sparkles, ThermometerSnowflake } from "lucide-react";
import { AppCard, Button, EmptyState, LoadingSkeleton, Modal, useToast } from "../ui";
import { getRole } from "../../config/rbac";
import { getSmartUnitCapabilities, runSmartUnitWorkflow } from "../../services/api";

const WRITE_ROLES = new Set(["owner", "manager"]);

const WORKFLOW_ICON = {
  checkin: LogIn,
  checkout: LogOut,
  mark_ready: Sparkles,
  safe_off: PowerOff,
  climate_safe_off: ThermometerSnowflake,
  lights_off: PowerOff,
};

// Order shown to the operator: the two everyday actions first.
const WORKFLOW_ORDER = [
  "checkin",
  "checkout",
  "mark_ready",
  "climate_safe_off",
  "lights_off",
  "safe_off",
  "guest_mode_on",
  "guest_mode_off",
];

const STATUS_CAPABILITIES = [
  ["status.stay", "Stato soggiorno"],
  ["status.housekeeping", "Pulizie"],
  ["flag.guest_mode", "Modalita ospite"],
  ["sensor.availability", "Dispositivi disponibili"],
  ["climate.main", "Clima"],
];

/**
 * Unit workflows exposed by the building.
 *
 * The portal states the intention ("this guest is arriving") and VillaCore runs
 * its own orchestration, keeping the safety conditions. An unavailable workflow
 * is shown as unavailable — never simulated — so the operator knows the building
 * side is not wired yet rather than believing the action happened.
 */
function UnitWorkflowPanel({ unitId, bookingId = null, compact = false, onDispatched }) {
  const toast = useToast();
  const canOperate = WRITE_ROLES.has(getRole());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [pending, setPending] = useState("");
  const [confirming, setConfirming] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  const load = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    setError("");
    try {
      setData(await getSmartUnitCapabilities(unitId));
    } catch (err) {
      setError(err.message || "Errore caricamento capability");
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => {
    load();
  }, [load]);

  async function dispatch(workflow) {
    setConfirming(null);
    setPending(workflow);
    try {
      const result = await runSmartUnitWorkflow(unitId, workflow,
        bookingId ? { booking_id: bookingId } : {});
      setLastResult(result);
      if (result.accepted) {
        toast.success(`${result.label} eseguito su VillaCore`);
      } else {
        toast.error(result.error_message || `${result.label} rifiutato da VillaCore`);
      }
      onDispatched?.(result);
      await load();
    } catch (err) {
      toast.error(err.message || "Workflow non eseguito");
    } finally {
      setPending("");
    }
  }

  if (loading) return <LoadingSkeleton rows={3} height={32} />;
  if (error) return <p style={{ color: "var(--color-danger)" }}>{error}</p>;
  if (!data) return null;

  const workflows = [...(data.workflows || [])].sort(
    (a, b) => WORKFLOW_ORDER.indexOf(a.workflow) - WORKFLOW_ORDER.indexOf(b.workflow)
  );
  const availableCount = workflows.filter((w) => w.available).length;
  const capabilityByKey = Object.fromEntries(
    (data.capabilities || []).map((item) => [item.capability_key, item])
  );
  const confirmingWorkflow = workflows.find((w) => w.workflow === confirming);

  const body = (
    <>
      {availableCount === 0 ? (
        <EmptyState
          title="Nessun workflow disponibile"
          description="VillaCore non espone workflow per questa unita. Verifica la mappa zone nella pagina Link VillaCore ed esegui una sincronizzazione."
        />
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {workflows.map((workflow) => {
            const Icon = WORKFLOW_ICON[workflow.workflow] || Sparkles;
            return (
              <Button
                key={workflow.workflow}
                variant={
                  workflow.workflow === "checkin"
                    ? "primary"
                    : workflow.needs_confirmation
                      ? "danger"
                      : "secondary"
                }
                size="sm"
                icon={<Icon size={14} />}
                disabled={!workflow.available || !canOperate}
                loading={pending === workflow.workflow}
                onClick={() =>
                  workflow.needs_confirmation
                    ? setConfirming(workflow.workflow)
                    : dispatch(workflow.workflow)
                }
                title={
                  !workflow.available
                    ? `Capability '${workflow.capability_key}' non presente in VillaCore`
                    : !canOperate
                      ? "Permesso insufficiente"
                      : undefined
                }
              >
                {workflow.label}
              </Button>
            );
          })}
        </div>
      )}

      {!compact ? (
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {STATUS_CAPABILITIES.map(([key, label]) => {
            const capability = capabilityByKey[key];
            if (!capability) return null;
            return (
              <span
                key={key}
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: 999,
                  padding: "2px 10px",
                  fontSize: 12,
                  background: "var(--color-surface-soft)",
                }}
                title={capability.device_name}
              >
                {label}: <strong>{capability.state?.value ?? "n/d"}</strong>
              </span>
            );
          })}
        </div>
      ) : null}

      {lastResult && !lastResult.accepted ? (
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
          {lastResult.error_message || "VillaCore ha rifiutato la richiesta."}
        </p>
      ) : null}

      <Modal
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        title={`${confirmingWorkflow?.label || "Workflow"} · ${data.unit_name}`}
        description="La richiesta viene eseguita da VillaCore, che mantiene le condizioni di sicurezza."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Annulla
            </Button>
            <Button variant="danger" onClick={() => dispatch(confirming)}>
              Conferma
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          Luci e clima verranno portati allo stato previsto dal workflow. La riattivazione resta
          manuale.
        </p>
      </Modal>
    </>
  );

  if (compact) return body;

  return (
    <AppCard>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <h3 style={{ margin: 0 }}>Workflow edificio</h3>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          {availableCount} disponibili su {workflows.length}
        </span>
      </div>
      <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "4px 0 10px" }}>
        Eseguiti da VillaCore: il portale dichiara l&apos;intenzione, l&apos;edificio applica le
        condizioni di sicurezza.
      </p>
      {body}
    </AppCard>
  );
}

export default UnitWorkflowPanel;
