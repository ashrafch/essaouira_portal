import { AppCard } from "../ui";
import ReadinessBadge from "./ReadinessBadge";

function ReadinessScoreCard({ title = "Guest Readiness", score = 0, status = "UNKNOWN", subtitle = "" }) {
  const normalizedScore = Number.isFinite(Number(score)) ? Math.max(0, Math.min(100, Number(score))) : 0;
  return (
    <AppCard>
      <div className="readiness-score-card__header">
        <div>
          <div className="readiness-score-card__title">{title}</div>
          {subtitle ? <div className="readiness-score-card__subtitle">{subtitle}</div> : null}
        </div>
        <ReadinessBadge status={status} />
      </div>
      <div className="readiness-score-card__value">{normalizedScore}/100</div>
    </AppCard>
  );
}

export default ReadinessScoreCard;

