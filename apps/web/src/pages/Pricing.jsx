import { useEffect, useState } from "react";
import {
  getUnits,
  updateUnit,
  getPricingDefaults,
  updatePricingDefaults,
} from "../services/api";
import { PageHeader, Button, Modal, useToast } from "../components/ui";
import RateCalendarEditor from "../components/RateCalendarEditor";
import RevenueRulesEditor from "../components/RevenueRulesEditor";
import MarketRatesEditor from "../components/MarketRatesEditor";
import ChannelSyncEditor from "../components/ChannelSyncEditor";
import PricingAlertsPanel from "../components/PricingAlertsPanel";

const EMPTY_PRICING = {
  default_cleaning_fee: "",
  default_city_tax_per_night: "",
  default_channel_fee_percent: "",
  default_currency: "EUR",
};

function Pricing() {
  const toast = useToast();
  const [units, setUnits] = useState([]);
  const [pricing, setPricing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingUnitId, setSavingUnitId] = useState(null);
  const [savingPricing, setSavingPricing] = useState(false);
  const [error, setError] = useState(null);

  const [unitModalOpen, setUnitModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [unitDraft, setUnitDraft] = useState({
    base_nightly_rate: "",
    currency: "EUR",
    min_price: "",
    max_price: "",
  });

  const [pricingModalOpen, setPricingModalOpen] = useState(false);
  const [pricingDraft, setPricingDraft] = useState(EMPTY_PRICING);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [uns, pd] = await Promise.all([getUnits(), getPricingDefaults()]);
        setUnits(uns || []);
        const pricingCfg = pd || EMPTY_PRICING;
        setPricing(pricingCfg);
        setPricingDraft(pricingCfg);
      } catch (err) {
        console.error("Errore caricando tariffe/pricing:", err);
        setError(err.message || "Errore caricando le tariffe.");
        setUnits([]);
        setPricing(EMPTY_PRICING);
        setPricingDraft(EMPTY_PRICING);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function openUnitModal(unit) {
    setEditingUnit(unit);
    setUnitDraft({
      base_nightly_rate:
        unit.base_nightly_rate == null ? "" : String(unit.base_nightly_rate),
      currency: unit.currency || "EUR",
      min_price: unit.min_price == null ? "" : String(unit.min_price),
      max_price: unit.max_price == null ? "" : String(unit.max_price),
    });
    setUnitModalOpen(true);
  }

  async function handleSaveUnit() {
    if (!editingUnit) return;
    setSavingUnitId(editingUnit.id);
    try {
      const toNumOrNull = (v) => (v === "" || v == null ? null : Number(v));
      const payload = {
        base_nightly_rate: toNumOrNull(unitDraft.base_nightly_rate),
        currency: unitDraft.currency || "EUR",
        min_price: toNumOrNull(unitDraft.min_price),
        max_price: toNumOrNull(unitDraft.max_price),
      };
      const updated = await updateUnit(editingUnit.id, payload);
      setUnits((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      toast.success("Tariffa unità aggiornata.");
      setUnitModalOpen(false);
      setEditingUnit(null);
    } catch (err) {
      toast.error("Errore salvando unità: " + err.message);
    } finally {
      setSavingUnitId(null);
    }
  }

  function openPricingModal() {
    setPricingDraft(pricing || EMPTY_PRICING);
    setPricingModalOpen(true);
  }

  function handleChangePricing(field, value) {
    setPricingDraft((prev) => ({
      ...(prev || EMPTY_PRICING),
      [field]: value,
    }));
  }

  async function handleSavePricing(e) {
    e.preventDefault();
    if (!pricingDraft) return;
    setSavingPricing(true);
    try {
      const payload = {
        default_cleaning_fee:
          pricingDraft.default_cleaning_fee === "" || pricingDraft.default_cleaning_fee == null
            ? null
            : Number(pricingDraft.default_cleaning_fee),
        default_city_tax_per_night:
          pricingDraft.default_city_tax_per_night === "" || pricingDraft.default_city_tax_per_night == null
            ? null
            : Number(pricingDraft.default_city_tax_per_night),
        default_channel_fee_percent:
          pricingDraft.default_channel_fee_percent === "" || pricingDraft.default_channel_fee_percent == null
            ? null
            : Number(pricingDraft.default_channel_fee_percent),
        default_currency: pricingDraft.default_currency || "EUR",
      };
      const updated = await updatePricingDefaults(payload);
      const normalized = updated || EMPTY_PRICING;
      setPricing(normalized);
      setPricingDraft(normalized);
      toast.success("Impostazioni pricing salvate.");
      setPricingModalOpen(false);
    } catch (err) {
      toast.error("Errore salvando tariffe: " + err.message);
    } finally {
      setSavingPricing(false);
    }
  }

  const page = {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  };

  const card = {
    background: "var(--color-surface)",
    borderRadius: 14,
    padding: 14,
    boxShadow: "var(--shadow-sm)",
    border: "1px solid var(--color-border)",
  };

  const field = {
    marginBottom: 8,
    display: "flex",
    flexDirection: "column",
    gap: 3,
  };

  const label = {
    fontSize: 11,
    fontWeight: 500,
    color: "var(--color-text)",
  };

  const input = {
    borderRadius: 8,
    border: "1px solid var(--color-border-strong)",
    padding: "6px 8px",
    fontSize: 13,
  };

  const table = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  };

  const th = {
    textAlign: "left",
    borderBottom: "1px solid var(--color-border)",
    padding: "6px 4px",
    color: "var(--color-text-muted)",
    fontSize: 11,
  };

  const td = {
    padding: "6px 4px",
    borderBottom: "1px solid var(--color-border)",
    verticalAlign: "top",
  };

  return (
    <div style={page}>
      <PageHeader
        title="Tariffe & Canali"
        subtitle="Gestisci le tariffe base per ogni appartamento e i valori di default per extra come pulizie, tasse e commissioni. Questi valori servono per precompilare le prenotazioni e chiudere il cerchio Ricavi / Costi."
      />

      {error && <p style={{ color: "var(--color-danger)", fontSize: 12 }}>{error}</p>}

      {loading ? (
        <p>Caricamento tariffe...</p>
      ) : (
        <>
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 14, margin: 0 }}>Tariffe base per unità (ADR di riferimento)</h2>
              <Button variant="primary" size="sm" onClick={openPricingModal}>
                Configura default pricing
              </Button>
            </div>
            <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 8 }}>
              Questi valori sono la base per il prezzo per notte. Puoi sempre
              sovrascriverli sulla singola prenotazione.
            </p>
            {units.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Nessuna unità configurata.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Unità</th>
                      <th style={th}>Mq</th>
                      <th style={th}>Capienza</th>
                      <th style={th}>Base nightly rate</th>
                      <th style={th}>Min €</th>
                      <th style={th}>Max €</th>
                      <th style={th}>Valuta</th>
                      <th style={th}>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map((u) => (
                      <tr key={u.id}>
                        <td style={td}>{u.name}</td>
                        <td style={td}>{u.size_m2 ?? "-"}</td>
                        <td style={td}>{u.capacity ?? "-"}</td>
                        <td style={td}>{u.base_nightly_rate == null ? "-" : Number(u.base_nightly_rate).toFixed(2)}</td>
                        <td style={td}>{u.min_price == null ? "-" : Number(u.min_price).toFixed(0)}</td>
                        <td style={td}>{u.max_price == null ? "-" : Number(u.max_price).toFixed(0)}</td>
                        <td style={td}>{u.currency || "EUR"}</td>
                        <td style={td}>
                          <Button variant="primary" size="sm" onClick={() => openUnitModal(u)}>
                            Modifica
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {pricing && (
            <div style={card}>
              <h2 style={{ fontSize: 14, marginBottom: 8 }}>Extra & Commissioni (valori di default)</h2>
              <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 8 }}>
                Cleaning fee: {pricing.default_cleaning_fee ?? "-"} · City tax/notte: {pricing.default_city_tax_per_night ?? "-"}
                · Commissione: {pricing.default_channel_fee_percent ?? "-"}% · Valuta: {pricing.default_currency || "EUR"}
              </p>
              <Button variant="primary" size="sm" onClick={openPricingModal}>
                Modifica impostazioni default
              </Button>
            </div>
          )}

          <PricingAlertsPanel />
          <RateCalendarEditor units={units} />
          <RevenueRulesEditor units={units} />
          <MarketRatesEditor units={units} />
          <ChannelSyncEditor units={units} />
        </>
      )}

      <Modal
        open={unitModalOpen}
        title={editingUnit ? `Modifica tariffa - ${editingUnit.name}` : "Modifica tariffa"}
        onClose={() => setUnitModalOpen(false)}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setUnitModalOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={handleSaveUnit}
              loading={Boolean(editingUnit && savingUnitId === editingUnit.id)}
            >
              Salva
            </Button>
          </>
        }
      >
        <div style={field}>
          <label style={label}>Base nightly rate</label>
          <input
            type="number"
            step="1"
            style={input}
            value={unitDraft.base_nightly_rate}
            onChange={(e) => setUnitDraft((prev) => ({ ...prev, base_nightly_rate: e.target.value }))}
          />
        </div>
        <div style={field}>
          <label style={label}>Valuta</label>
          <input
            style={input}
            value={unitDraft.currency}
            onChange={(e) => setUnitDraft((prev) => ({ ...prev, currency: e.target.value }))}
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={field}>
            <label style={label}>Prezzo minimo (guardrail consigli)</label>
            <input
              type="number"
              step="1"
              style={input}
              value={unitDraft.min_price}
              onChange={(e) => setUnitDraft((prev) => ({ ...prev, min_price: e.target.value }))}
              placeholder="nessun minimo"
            />
          </div>
          <div style={field}>
            <label style={label}>Prezzo massimo (guardrail consigli)</label>
            <input
              type="number"
              step="1"
              style={input}
              value={unitDraft.max_price}
              onChange={(e) => setUnitDraft((prev) => ({ ...prev, max_price: e.target.value }))}
              placeholder="nessun massimo"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={pricingModalOpen}
        title="Modifica default pricing"
        onClose={() => setPricingModalOpen(false)}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPricingModalOpen(false)}>
              Annulla
            </Button>
            <Button type="submit" form="pricing-defaults-form" loading={savingPricing}>
              Salva impostazioni
            </Button>
          </>
        }
      >
        <form id="pricing-defaults-form" onSubmit={handleSavePricing}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <div style={field}>
              <label style={label}>Cleaning fee predefinita per soggiorno</label>
              <input
                type="number"
                step="0.01"
                style={input}
                value={pricingDraft.default_cleaning_fee == null ? "" : pricingDraft.default_cleaning_fee}
                onChange={(e) => handleChangePricing("default_cleaning_fee", e.target.value)}
                placeholder="es. 20"
              />
            </div>
            <div style={field}>
              <label style={label}>City tax per notte (totale, per booking)</label>
              <input
                type="number"
                step="0.01"
                style={input}
                value={pricingDraft.default_city_tax_per_night == null ? "" : pricingDraft.default_city_tax_per_night}
                onChange={(e) => handleChangePricing("default_city_tax_per_night", e.target.value)}
                placeholder="es. 1.50"
              />
            </div>
            <div style={field}>
              <label style={label}>Commissione canale (% sulla prenotazione)</label>
              <input
                type="number"
                step="0.1"
                style={input}
                value={pricingDraft.default_channel_fee_percent == null ? "" : pricingDraft.default_channel_fee_percent}
                onChange={(e) => handleChangePricing("default_channel_fee_percent", e.target.value)}
                placeholder="es. 15"
              />
            </div>
            <div style={field}>
              <label style={label}>Valuta di default</label>
              <input
                style={input}
                value={pricingDraft.default_currency || "EUR"}
                onChange={(e) => handleChangePricing("default_currency", e.target.value)}
                maxLength={3}
              />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default Pricing;
