import { Clock3 } from "lucide-react";
import { AppCard, SeverityBadge } from "../ui";

function ActivityCard({ title, subtitle = "", severity = "info", timestamp = null, right = null }) {
  return (
    <AppCard hover className="activity-card">
      <div className="activity-card__content">
        <div className="activity-card__main">
          <div className="activity-card__title">{title}</div>
          {subtitle ? <div className="activity-card__subtitle">{subtitle}</div> : null}
          {timestamp ? (
            <div className="activity-card__time">
              <Clock3 size={12} />
              {new Date(timestamp).toLocaleString()}
            </div>
          ) : null}
        </div>
        <div className="activity-card__actions">
          <SeverityBadge severity={severity} />
          {right}
        </div>
      </div>
    </AppCard>
  );
}

export default ActivityCard;
