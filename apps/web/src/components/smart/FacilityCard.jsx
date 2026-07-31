import { useState } from "react";
import { AlertTriangle, ExternalLink, PowerOff, RotateCcw, ShieldAlert } from "lucide-react";
import { AppCard, Button, Modal, SeverityBadge, StatusBadge } from "../ui";

const HEALTH_TO_STATUS = {
  ok: "healthy",
  alarm: "critical",
  unavailable: "offline",
  unknown: "default",
};

const HEALTH_LABEL = {
  ok: "In servizio",
  alarm: "In allarme",
  unavailable: "Non raggiungibile",
  unknown: "Stato ignoto",
};

const ACTION_ICON = { safe_off: PowerOff, alarm_reset: RotateCcw };

function formatMetric(metric) {
  const raw = metric.value ?? metric.temperature_c ?? metric.energy_w;
  if (raw === null || raw === undefined || raw === "") return "n/d";
  return String(raw);
}

function metricLabel(metricType) {
  const labels = {
    temperature: "Temperatura",
    pressure: "Pressione",
    runtime: "Ore di marcia",
    flow_rate: "Portata",
    water_volume: "Acqua",
    moisture: "Umidita suolo",
    energy: "Energia",
    power: "Potenza",
    position: "Posizione",
    humidity: "Umidita",
    cost: "Costo",
  };
  return labels[metricType] || metricType;
}

/**
 * One shared plant (pool filtration, irrigation, gate...) as an asset card.
 *
 * Read-heavy by design: state, alarms, interlocks and metrics are shown, but the
 * only actions offered are safe-off and alarm rearm. Mode changes, manual
 * starts, timers and setpoints stay in Home Assistant, which owns the
 * interlocks — the portal must never look like a substitute for them.
 */
function FacilityCard({ facility, cost = null, canOperate = false, onAction, haUrl = "" }) {
  const [pending, setPending] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const status = HEALTH_TO_STATUS[facility.health] || "default";

  async function runAction(action) {
    setConfirming(null);
    setPending(action);
    try {
      await onAction?.(facility.facility_key, action);
    } finally {
      setPending(null);
    }
  }

  const confirmingAction = facility.actions?.find((a) => a.action === confirming);
  // A metering or diagnostic zone (energy, PLC) has no state machine to stop or
  // rearm. Greyed-out buttons there would imply an action that should exist.
  const offeredActions = facility.actions?.filter((action) => action.available) || [];

  return (
    <AppCard>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>{facility.display_name}</h3>
          <p style={{ margin: "2px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>
            {facility.machine ? `Impianto ${facility.machine} · ` : ""}
            {facility.device_count} dispositivi
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <StatusBadge status={status} />
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            {HEALTH_LABEL[facility.health] || facility.health}
          </span>
        </div>
      </div>

      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
          margin: "12px 0 0",
        }}
      >
        <div>
          <dt style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Stato macchina</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>{facility.state ?? "n/d"}</dd>
        </div>
        <div>
          <dt style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Modalita</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>{facility.mode ?? "n/d"}</dd>
        </div>
        <div>
          <dt style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Supervisione</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>{facility.supervision_state ?? "n/d"}</dd>
        </div>
        {cost ? (
          <div>
            <dt style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              Costo del mese{cost.estimated ? " (stima)" : ""}
            </dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>
              {cost.amount.toFixed(2)} EUR
              <span style={{ fontWeight: 400, color: "var(--color-text-muted)", fontSize: 12 }}>
                {" "}
                · {cost.quantity} {cost.unit_of_measure}
              </span>
            </dd>
          </div>
        ) : null}
      </dl>

      {facility.metrics?.length ? (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "0 0 4px" }}>
            Telemetria
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {facility.metrics.map((metric) => (
              <span
                key={metric.capability_key + metric.device_id}
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: 999,
                  padding: "2px 10px",
                  fontSize: 12,
                  background: "var(--color-surface-soft)",
                }}
                title={metric.device_name}
              >
                {metricLabel(metric.metric_type)}: <strong>{formatMetric(metric)}</strong>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {facility.interlocks?.length ? (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "0 0 4px" }}>
            Interblocchi (gestiti da VillaCore, sola lettura)
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {facility.interlocks.map((interlock) => (
              <span
                key={interlock.capability_key + interlock.device_id}
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: 999,
                  padding: "2px 10px",
                  fontSize: 12,
                }}
                title={interlock.device_name}
              >
                {interlock.name}: <strong>{interlock.value ?? "n/d"}</strong>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {facility.open_alerts?.length ? (
        <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
          {facility.open_alerts.map((alert) => (
            <div
              key={alert.id}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                border: "1px solid var(--color-danger)",
                background: "var(--color-danger-soft)",
                borderRadius: 8,
                padding: "6px 10px",
              }}
            >
              <AlertTriangle size={14} />
              <span style={{ flex: 1, fontSize: 13 }}>{alert.title}</span>
              <SeverityBadge severity={alert.severity} />
            </div>
          ))}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 14,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {offeredActions.length === 0 ? (
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Sola lettura: questa zona non espone comandi.
          </span>
        ) : null}
        {offeredActions.map((action) => {
          const Icon = ACTION_ICON[action.action] || ShieldAlert;
          return (
            <Button
              key={action.action}
              variant={action.action === "safe_off" ? "danger" : "secondary"}
              size="sm"
              icon={<Icon size={14} />}
              disabled={!canOperate}
              loading={pending === action.action}
              onClick={() => setConfirming(action.action)}
              title={!canOperate ? "Permesso insufficiente" : undefined}
            >
              {action.label}
            </Button>
          );
        })}
        {haUrl ? (
          <a
            href={haUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              marginLeft: "auto",
              fontSize: 13,
              display: "inline-flex",
              gap: 4,
              alignItems: "center",
              color: "var(--color-primary)",
            }}
          >
            Comandi completi in VillaCore <ExternalLink size={13} />
          </a>
        ) : null}
      </div>

      <Modal
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        title={`${confirmingAction?.label || "Azione"} · ${facility.display_name}`}
        description="La richiesta viene inviata a VillaCore, che mantiene gli interblocchi fisici e puo rifiutarla."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Annulla
            </Button>
            <Button
              variant={confirming === "safe_off" ? "danger" : "primary"}
              onClick={() => runAction(confirming)}
            >
              Conferma
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          {confirming === "safe_off"
            ? "L'impianto viene portato nello stato sicuro. Il riavvio resta manuale."
            : "Il riarmo viene rifiutato se una protezione e ancora attiva: in quel caso il motivo viene mostrato qui."}
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--color-text-muted)" }}>
          Il software non sostituisce protezioni elettriche, termiche, fine corsa o arresti di
          emergenza.
        </p>
      </Modal>
    </AppCard>
  );
}

export default FacilityCard;
