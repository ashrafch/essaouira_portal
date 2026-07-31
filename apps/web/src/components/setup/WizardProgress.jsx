import { Check } from "lucide-react";

/**
 * Horizontal step indicator for the setup wizard.
 *
 * Shows where you are, what is behind you and what is still ahead, because the
 * previous version gave no sense of progress and every step looked equally
 * urgent.
 */
function WizardProgress({ steps, currentKey, completed = false }) {
  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.key === currentKey)
  );

  return (
    <ol
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        listStyle: "none",
        margin: "0 0 16px",
        padding: 0,
      }}
    >
      {steps.map((step, index) => {
        const isDone = completed || index < currentIndex;
        const isCurrent = !completed && index === currentIndex;
        return (
          <li
            key={step.key}
            aria-current={isCurrent ? "step" : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: isCurrent ? 700 : 500,
              border: `1px solid ${
                isCurrent
                  ? "var(--color-primary)"
                  : isDone
                    ? "var(--color-success)"
                    : "var(--color-border)"
              }`,
              background: isCurrent
                ? "var(--color-primary-soft, var(--color-surface-soft))"
                : isDone
                  ? "var(--color-success-soft)"
                  : "var(--color-surface)",
              color: isDone
                ? "var(--color-success-strong)"
                : isCurrent
                  ? "var(--color-primary)"
                  : "var(--color-text-muted)",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 20,
                height: 20,
                borderRadius: "50%",
                fontSize: 11,
                fontWeight: 700,
                background: isDone
                  ? "var(--color-success)"
                  : isCurrent
                    ? "var(--color-primary)"
                    : "var(--color-surface-soft)",
                color: isDone || isCurrent ? "#fff" : "var(--color-text-muted)",
              }}
            >
              {isDone ? <Check size={12} /> : index + 1}
            </span>
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}

export default WizardProgress;
