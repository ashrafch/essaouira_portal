import { Info, Lock } from "lucide-react";
import { AppCard } from "../ui";

/**
 * One step of the setup wizard: number, title, what it means, then the controls.
 *
 * The explanation is a required prop on purpose. The old wizard showed bare
 * inputs with no context, so it was impossible to know what a step would do
 * before doing it — which is how an entire building ended up attached to one
 * apartment.
 */
function WizardStep({
  index,
  title,
  subtitle = "",
  explanation,
  note = "",
  locked = false,
  lockedReason = "",
  active = true,
  done = false,
  children,
  footer = null,
}) {
  return (
    <AppCard
      style={{
        marginBottom: 12,
        opacity: locked ? 0.6 : 1,
        borderColor: active ? "var(--color-primary)" : undefined,
        borderWidth: active ? 2 : undefined,
        borderStyle: active ? "solid" : undefined,
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 28,
            height: 28,
            borderRadius: "50%",
            fontWeight: 700,
            fontSize: 13,
            background: done
              ? "var(--color-success)"
              : active
                ? "var(--color-primary)"
                : "var(--color-surface-soft)",
            color: done || active ? "#fff" : "var(--color-text-muted)",
          }}
        >
          {index}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {title}
            {done ? (
              <span style={{ fontSize: 12, color: "var(--color-success-strong)", fontWeight: 600 }}>
                completato
              </span>
            ) : null}
          </h3>
          {subtitle ? (
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--color-text-muted)" }}>
              {subtitle}
            </p>
          ) : null}

          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              margin: "10px 0",
              padding: "8px 10px",
              borderRadius: 8,
              background: "var(--color-info-soft)",
              border: "1px solid var(--color-info)",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <Info size={15} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>{explanation}</div>
          </div>

          {locked ? (
            <p
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                fontSize: 13,
                color: "var(--color-text-muted)",
                margin: "0 0 8px",
              }}
            >
              <Lock size={14} /> {lockedReason || "Completa prima il passo precedente."}
            </p>
          ) : (
            children
          )}

          {note && !locked ? (
            <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
              {note}
            </p>
          ) : null}

          {footer && !locked ? <div style={{ marginTop: 12 }}>{footer}</div> : null}
        </div>
      </div>
    </AppCard>
  );
}

export default WizardStep;
