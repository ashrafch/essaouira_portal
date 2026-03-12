import { AppCard, EmptyState } from "../ui";
import ReadinessBadge from "./ReadinessBadge";

function UnitReadinessPanel({ readiness }) {
  if (!readiness) {
    return (
      <AppCard>
        <h3 style={{ marginBottom: 8 }}>Guest Readiness</h3>
        <EmptyState title="Readiness non disponibile" />
      </AppCard>
    );
  }

  const blocking = readiness.blocking_reasons || [];
  const warnings = readiness.warning_reasons || [];

  return (
    <AppCard>
      <div className="unit-readiness-panel__header">
        <h3 style={{ margin: 0 }}>Guest Readiness</h3>
        <ReadinessBadge status={readiness.readiness_status} />
      </div>
      <div className="unit-readiness-panel__score">Score: {readiness.readiness_score}/100</div>
      {blocking.length > 0 ? (
        <div className="unit-readiness-panel__block">
          <div className="unit-readiness-panel__block-title">Blocking reasons</div>
          <ul className="unit-readiness-panel__list">
            {blocking.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <div className="unit-readiness-panel__block">
          <div className="unit-readiness-panel__block-title">Warning reasons</div>
          <ul className="unit-readiness-panel__list">
            {warnings.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </AppCard>
  );
}

export default UnitReadinessPanel;

