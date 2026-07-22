import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Button, useToast } from "./ui";
import { getPricingAlerts } from "../services/api";

const SEVERITY = {
  high: { color: "var(--color-danger)", bg: "var(--color-danger-soft)", border: "var(--color-danger)" },
  warning: {
    color: "var(--color-warning-strong)",
    bg: "var(--color-warning-soft)",
    border: "var(--color-warning)",
  },
  info: { color: "var(--color-info-strong)", bg: "var(--color-info-soft)", border: "var(--color-info)" },
};

/**
 * Read-only pricing alerts for the next ~60 days: price out of the comp-set
 * band, orphan nights, low forward occupancy. Computed on demand, never mutates.
 */
export default function PricingAlertsPanel() {
  const toast = useToast();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setAlerts((await getPricingAlerts(60)) || []);
    } catch (err) {
      toast.error("Errore caricando gli alert di pricing: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  const card = {
    background: "var(--color-surface)",
    borderRadius: 14,
    padding: 14,
    boxShadow: "var(--shadow-sm)",
    border: "1px solid var(--color-border)",
  };

  return (
    <div style={card}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <div>
          <h2 style={{ fontSize: 14, margin: 0 }}>Alert di pricing (prossimi 60 giorni)</h2>
          <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "2px 0 0" }}>
            Prezzo fuori dalla banda di mercato, notti orfane, occupazione futura
            bassa. Solo segnalazioni: non modificano i prezzi.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={<RefreshCw size={15} />}
          onClick={reload}
          loading={loading}
        >
          Aggiorna
        </Button>
      </div>

      {loading ? (
        <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Caricamento…</p>
      ) : alerts.length === 0 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: "var(--color-success-strong)",
            background: "var(--color-success-soft)",
            border: "1px solid var(--color-success)",
            borderRadius: 10,
            padding: 10,
          }}
        >
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>Nessun alert di pricing.</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {alerts.map((a, i) => {
            const sev = SEVERITY[a.severity] || SEVERITY.info;
            return (
              <div
                key={`${a.code}-${a.unit_id}-${i}`}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  background: sev.bg,
                  border: `1px solid ${sev.border}`,
                  borderRadius: 10,
                  padding: "8px 10px",
                }}
              >
                <AlertTriangle size={16} style={{ color: sev.color, marginTop: 2 }} aria-hidden="true" />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>
                    {a.title}
                    {a.unit_name ? (
                      <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>
                        {" "}
                        · {a.unit_name}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{a.details}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
