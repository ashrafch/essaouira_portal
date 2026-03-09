import { Bell, Bot, CalendarClock, Cpu } from "lucide-react";
import { SeverityBadge } from "../ui";

const ICON_MAP = {
  alert: Bell,
  automation: Bot,
  booking: CalendarClock,
  device: Cpu,
};

function TimelineItem({ item }) {
  const category = String(item.category || "device").toLowerCase();
  const Icon = ICON_MAP[category] || Cpu;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "24px 1fr", gap: 10, alignItems: "start" }}>
      <div style={{ marginTop: 4, color: "#475569" }}>
        <Icon size={14} />
      </div>
      <div style={{ borderLeft: "2px solid #e2e8f0", paddingLeft: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>{item.title}</div>
          <SeverityBadge severity={item.severity || "info"} />
        </div>
        {item.description ? (
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{item.description}</div>
        ) : null}
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
          {item.source || item.event_type || "event"} · {item.occurred_at ? new Date(item.occurred_at).toLocaleString() : "-"}
        </div>
      </div>
    </div>
  );
}

export default TimelineItem;
