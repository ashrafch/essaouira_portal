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
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10, background: "#ffffff" }}>
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
      <div style={{ marginTop: 6, fontSize: 12, color: "#475569" }}>
        device #{insight.device_id} · unità {insight.unit_id || "n/d"} · metric {insight.metric_type}
      </div>
      <div style={{ marginTop: 4, fontSize: 12, color: "#334155" }}>
        valore {insight.value ?? "n/d"} · soglia {insight.threshold ?? "n/d"}
      </div>
      <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
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
