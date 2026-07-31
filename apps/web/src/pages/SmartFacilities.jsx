import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Wallet } from "lucide-react";
import {
  ActionToolbar,
  AppCard,
  Button,
  EmptyState,
  LoadingSkeleton,
  SectionHeader,
  StatCard,
  useToast,
} from "../components/ui";
import FacilityCard from "../components/smart/FacilityCard";
import { getRole } from "../config/rbac";
import {
  getSmartFacilities,
  getSmartUtilityCosts,
  postSmartUtilityCosts,
  runSmartFacilityAction,
} from "../services/api";

const WRITE_ROLES = new Set(["owner", "manager"]);

const TH = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid var(--color-border)",
  color: "var(--color-text-muted)",
  fontWeight: 600,
};
const TD = { padding: "8px 10px", borderBottom: "1px solid var(--color-border)" };

function currentPeriod() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/**
 * Shared infrastructure that is not a rental unit: pool, irrigation, gate,
 * outdoor lighting, metering.
 *
 * The portal's contribution here is the asset and cost view — what it costs,
 * what broke, what needs a work order. Live control stays in Home Assistant,
 * which owns the interlocks.
 */
function SmartFacilities() {
  const toast = useToast();
  const role = getRole();
  const canOperate = WRITE_ROLES.has(role);
  const [{ year, month }, setPeriod] = useState(currentPeriod);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [facilities, setFacilities] = useState([]);
  const [costs, setCosts] = useState(null);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [facilityData, costData] = await Promise.all([
        getSmartFacilities(),
        getSmartUtilityCosts(year, month).catch(() => null),
      ]);
      setFacilities(facilityData || []);
      setCosts(costData);
    } catch (err) {
      setError(err.message || "Errore caricamento impianti");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    load();
  }, [load]);

  const costByFacility = useMemo(() => {
    const map = {};
    (costs?.rows || []).forEach((row) => {
      if (row.facility_key) map[row.facility_key] = row;
    });
    return map;
  }, [costs]);

  const totals = useMemo(() => {
    const alarms = facilities.filter((f) => f.alarm_active === true).length;
    const unavailable = facilities.filter((f) => f.devices_available === false).length;
    const openAlerts = facilities.reduce((sum, f) => sum + (f.open_alerts?.length || 0), 0);
    return { alarms, unavailable, openAlerts };
  }, [facilities]);

  async function handleAction(facilityKey, action) {
    try {
      const result = await runSmartFacilityAction(facilityKey, action);
      if (result.accepted) {
        toast.success(`${result.label} inviato a VillaCore`);
      } else {
        // A refusal by the building is a legitimate answer, not a portal bug.
        toast.error(result.error_message || `${result.label} rifiutato da VillaCore`);
      }
      await load();
    } catch (err) {
      toast.error(err.message || "Azione non riuscita");
    }
  }

  async function handlePostCosts() {
    setPosting(true);
    try {
      const result = await postSmartUtilityCosts(year, month);
      toast.success(
        `Costi utenze registrati: ${result.created} nuovi, ${result.updated} aggiornati` +
          (result.has_estimates ? " (include stime)" : "")
      );
      await load();
    } catch (err) {
      toast.error(err.message || "Registrazione costi non riuscita");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div>
      <SectionHeader
        title="Impianti e aree comuni"
        subtitle="Piscina, irrigazione, cancello ed energia: stato, allarmi e costi. I comandi completi restano in VillaCore, che possiede gli interblocchi."
      />

      <ActionToolbar>
        <input
          type="month"
          value={`${year}-${String(month).padStart(2, "0")}`}
          onChange={(event) => {
            const [nextYear, nextMonth] = event.target.value.split("-");
            if (nextYear && nextMonth) {
              setPeriod({ year: Number(nextYear), month: Number(nextMonth) });
            }
          }}
          aria-label="Mese dei costi"
        />
        <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={load}>
          Aggiorna
        </Button>
        {canOperate ? (
          <Button
            variant="primary"
            icon={<Wallet size={14} />}
            loading={posting}
            onClick={handlePostCosts}
            disabled={!costs?.rows?.length}
            title={
              costs?.rows?.length
                ? "Registra i consumi del mese come voci di costo"
                : "Nessun consumo misurato per questo mese"
            }
          >
            Registra costi del mese
          </Button>
        ) : null}
      </ActionToolbar>

      {loading ? <LoadingSkeleton rows={5} height={40} /> : null}
      {error ? <p style={{ color: "var(--color-danger)" }}>{error}</p> : null}

      {!loading && !error ? (
        <>
          <div className="ui-grid-cards" style={{ marginBottom: 12 }}>
            <StatCard label="Impianti monitorati" value={facilities.length} />
            <StatCard label="In allarme" value={totals.alarms} tone={totals.alarms ? "danger" : "success"} />
            <StatCard
              label="Non raggiungibili"
              value={totals.unavailable}
              tone={totals.unavailable ? "warning" : "success"}
            />
            <StatCard label="Alert aperti" value={totals.openAlerts} tone={totals.openAlerts ? "warning" : "success"} />
            <StatCard
              label={`Utenze ${String(month).padStart(2, "0")}/${year}`}
              value={costs ? `${costs.total_amount.toFixed(2)} EUR` : "n/d"}
              tone="info"
            />
          </div>

          {costs?.has_estimates ? (
            <AppCard style={{ marginBottom: 12 }}>
              <p style={{ margin: 0, fontSize: 13 }}>
                Alcuni importi sono <strong>stime</strong> calcolate da ore di marcia e potenza
                nominale, perche l&apos;impianto non espone ancora un contatore. Sono etichettate
                come tali in ogni riga e nel P&amp;L.
              </p>
            </AppCard>
          ) : null}

          {facilities.length === 0 ? (
            <EmptyState
              title="Nessun impianto rilevato"
              description="Collega VillaCore ed esegui una sincronizzazione provider dalla pagina Link VillaCore."
            />
          ) : (
            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
              }}
            >
              {facilities.map((facility) => (
                <FacilityCard
                  key={facility.facility_key}
                  facility={facility}
                  cost={costByFacility[facility.facility_key] || null}
                  canOperate={canOperate}
                  onAction={handleAction}
                />
              ))}
            </div>
          )}

          {costs?.rows?.length ? (
            <AppCard style={{ marginTop: 12 }}>
              <h3 style={{ marginTop: 0 }}>
                Utenze {String(month).padStart(2, "0")}/{year}
              </h3>
              <div style={{ overflowX: "auto" }}>
                <table
                  className="ui-table-cards"
                  style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
                >
                  <thead>
                    <tr>
                      <th style={TH}>Ambito</th>
                      <th style={TH}>Metrica</th>
                      <th style={{ ...TH, textAlign: "right" }}>Consumo</th>
                      <th style={{ ...TH, textAlign: "right" }}>Prezzo</th>
                      <th style={{ ...TH, textAlign: "right" }}>Importo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costs.rows.map((row) => (
                      <tr key={`${row.metric}-${row.scope}-${row.facility_key || row.unit_id}`}>
                        <td style={TD} data-label="Ambito">
                          {row.label}
                          {row.estimated ? (
                            <span
                              style={{ color: "var(--color-warning-strong)", fontSize: 12 }}
                              title={row.estimate_basis || ""}
                            >
                              {" "}
                              · stima
                            </span>
                          ) : null}
                        </td>
                        <td style={TD} data-label="Metrica">
                          {row.metric}
                        </td>
                        <td style={{ ...TD, textAlign: "right" }} data-label="Consumo">
                          {row.quantity} {row.unit_of_measure}
                        </td>
                        <td style={{ ...TD, textAlign: "right" }} data-label="Prezzo">
                          {row.unit_price}
                        </td>
                        <td
                          style={{ ...TD, textAlign: "right", fontWeight: 600 }}
                          data-label="Importo"
                        >
                          {row.amount.toFixed(2)} EUR
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
                Tariffa energia {costs.energy_price_eur_kwh} EUR/kWh
                {costs.energy_price_source === "villacore"
                  ? " (letta da VillaCore)"
                  : " (valore di default del portale)"}
              </p>
            </AppCard>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default SmartFacilities;
