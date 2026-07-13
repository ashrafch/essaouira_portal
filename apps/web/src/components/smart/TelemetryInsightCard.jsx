import { AlertTriangle, Thermometer, Droplets, Zap, Radio } from "lucide-react";
import { SeverityBadge, StatusBadge } from "../ui";

function iconForInsight(insightType) {
  if ((insightType || "").includes("temperature")) return <Thermometer size={14} />;
  if ((insightType || "").includes("humidity")) return <Droplets size={14} />;
  if ((insightType || "").includes("energy")) return <Zap size={14} />;
  if ((insightType || "").includes("not_reporting")) return <Radio size={14} />;
  return <AlertTriangle size={14} />;
}

function TelemetryInsightCard({ insight, onOpen }) {
  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: 10, background: "var(--color-surface)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {iconForInsight(insight.insight_type)}
          {insight.insight_type}
        </strong>
        <div style={{ display: "inline-flex", gap: 6 }}>
          <StatusBadge status={insight.status || "open"} />
          <SeverityBadge severity={insight.severity || "warning"} />
        </div>
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: "var(--color-text-muted)" }}>
        device #{insight.device_id} · unità {insight.unit_id || "n/d"} · metric {insight.metric_type}
      </div>
      <div style={{ marginTop: 4, fontSize: 12, color: "var(--color-text)" }}>
        valore {insight.value ?? "n/d"} · soglia {insight.threshold ?? "n/d"}
      </div>
      <div style={{ marginTop: 4, fontSize: 12, color: "var(--color-text-muted)" }}>
        rilevato: {insight.detected_at ? new Date(insight.detected_at).toLocaleString() : "n/d"}
      </div>
      {onOpen ? (
        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={() => onOpen(insight)}>Apri dettaglio</button>
        </div>
      ) : null}
    </div>
  );
}

export default TelemetryInsightCard;
