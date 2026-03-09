import { Clock3 } from "lucide-react";
import { AppCard, SeverityBadge } from "../ui";

function ActivityCard({ title, subtitle = "", severity = "info", timestamp = null, right = null }) {
  return (
    <AppCard hover>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700 }}>{title}</div>
          {subtitle ? <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{subtitle}</div> : null}
          {timestamp ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#64748b", display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Clock3 size={12} />
              {new Date(timestamp).toLocaleString()}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <SeverityBadge severity={severity} />
          {right}
        </div>
      </div>
    </AppCard>
  );
}

export default ActivityCard;
