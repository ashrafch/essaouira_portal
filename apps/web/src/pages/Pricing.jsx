import { useEffect, useState } from "react";
import AppModal from "../components/AppModal";
import {
  getUnits,
  updateUnit,
  getPricingDefaults,
  updatePricingDefaults,
} from "../services/api";

const EMPTY_PRICING = {
  default_cleaning_fee: "",
  default_city_tax_per_night: "",
  default_channel_fee_percent: "",
  default_currency: "EUR",
};

function Pricing() {
  const [units, setUnits] = useState([]);
  const [pricing, setPricing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingUnitId, setSavingUnitId] = useState(null);
  const [savingPricing, setSavingPricing] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState("");
  const [infoModal, setInfoModal] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [uns, pd] = await Promise.all([
          getUnits(),
          getPricingDefaults(),
        ]);
        setUnits(uns || []);
        setPricing(pd || EMPTY_PRICING);
      } catch (err) {
        console.error("Errore caricando tariffe/pricing:", err);
        setError(err.message || "Errore caricando le tariffe.");
        setUnits([]);
        setPricing(EMPTY_PRICING);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function handleChangeUnit(id, field, value) {
    setUnits((prev) =>
      prev.map((u) => (u.id === id ? { ...u, [field]: value } : u))
    );
  }

  async function handleSaveUnit(u) {
    setSavingUnitId(u.id);
    try {
      const payload = {
        base_nightly_rate:
          u.base_nightly_rate === "" || u.base_nightly_rate == null
            ? null
            : Number(u.base_nightly_rate),
        currency: u.currency || "EUR",
      };
      const updated = await updateUnit(u.id, payload);
      setUnits((prev) =>
        prev.map((x) => (x.id === updated.id ? updated : x))
      );
    } catch (err) {
      alert("Errore salvando unità: " + err.message);
    } finally {
      setSavingUnitId(null);
    }
  }

  function handleChangePricing(field, value) {
    setPricing((prev) => ({
      ...(prev || EMPTY_PRICING),
      [field]: value,
    }));
  }

  async function handleSavePricing(e) {
    e.preventDefault();
    if (!pricing) return;
    setSavingPricing(true);
    setMsg("");
    try {
      const payload = {
        default_cleaning_fee:
          pricing.default_cleaning_fee === "" ||
          pricing.default_cleaning_fee == null
            ? null
            : Number(pricing.default_cleaning_fee),
        default_city_tax_per_night:
          pricing.default_city_tax_per_night === "" ||
          pricing.default_city_tax_per_night == null
            ? null
            : Number(pricing.default_city_tax_per_night),
        default_channel_fee_percent:
          pricing.default_channel_fee_percent === "" ||
          pricing.default_channel_fee_percent == null
            ? null
            : Number(pricing.default_channel_fee_percent),
        default_currency: pricing.default_currency || "EUR",
      };
      const updated = await updatePricingDefaults(payload);
      setPricing(updated || EMPTY_PRICING);
      setMsg("Impostazioni tariffe salvate.");
    } catch (err) {
      alert("Errore salvando tariffe: " + err.message);
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
    background: "white",
    borderRadius: 16,
    padding: 14,
    boxShadow: "0 8px 20px rgba(15,23,42,0.05)",
    border: "1px solid #e2e8f0",
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
    color: "#374151",
  };

  const input = {
    borderRadius: 8,
    border: "1px solid #d1d5db",
    padding: "6px 8px",
    fontSize: 13,
  };

  const buttonPrimary = {
    borderRadius: 999,
    border: "none",
    padding: "7px 12px",
    fontSize: 12,
    fontWeight: 600,
    backgroundColor: "#0f766e",
    color: "white",
    cursor: "pointer",
  };

  const infoButton = {
    borderRadius: 999,
    border: "1px solid #cbd5e1",
    width: 24,
    height: 24,
    padding: 0,
    backgroundColor: "#ffffff",
    color: "#0f172a",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
  };

  const table = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  };

  const th = {
    textAlign: "left",
    borderBottom: "1px solid #e5e7eb",
    padding: "6px 4px",
    color: "#6b7280",
    fontSize: 11,
  };

  const td = {
    padding: "6px 4px",
    borderBottom: "1px solid #f3f4f6",
    verticalAlign: "top",
  };

  return (
    <div style={page}>
      <div>
        <h1 style={{ marginBottom: 4 }}>Tariffe & Canali</h1>
        <p style={{ fontSize: 13, color: "#6b7280" }}>
          Gestisci le tariffe base per ogni appartamento e i valori di default
          per extra come pulizie, tasse e commissioni. Questi valori servono per
          precompilare le prenotazioni e chiudere il cerchio Ricavi / Costi.
        </p>
      </div>

      {error && (
        <p style={{ color: "red", fontSize: 12 }}>{error}</p>
      )}

      {loading ? (
        <p>Caricamento tariffe...</p>
      ) : (
        <>
          <div style={card}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <h2 style={{ fontSize: 14, margin: 0 }}>
                Tariffe base per unità (ADR di riferimento)
              </h2>
              <button
                type="button"
                style={infoButton}
                aria-label="Info tariffe base"
                onClick={() => setInfoModal("base_rates")}
              >
                i
              </button>
            </div>
            <p
              style={{
                fontSize: 11,
                color: "#6b7280",
                marginBottom: 8,
              }}
            >
              Questi valori sono la base per il prezzo per notte. Puoi sempre
              sovrascriverli sulla singola prenotazione.
            </p>
            {units.length === 0 ? (
              <p style={{ fontSize: 12, color: "#6b7280" }}>
                Nessuna unità configurata.
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Unità</th>
                      <th style={th}>Mq</th>
                      <th style={th}>Capienza</th>
                      <th style={th}>Base nightly rate</th>
                      <th style={th}>Valuta</th>
                      <th style={th}>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map((u) => (
                      <tr key={u.id}>
                        <td style={td}>{u.name}</td>
                        <td style={td}>{u.size_m2 ?? "—"}</td>
                        <td style={td}>{u.capacity ?? "—"}</td>
                        <td style={td}>
                          <input
                            type="number"
                            step="1"
                            style={{ ...input, fontSize: 12 }}
                            value={
                              u.base_nightly_rate == null
                                ? ""
                                : u.base_nightly_rate
                            }
                            onChange={(e) =>
                              handleChangeUnit(
                                u.id,
                                "base_nightly_rate",
                                e.target.value
                              )
                            }
                          />
                        </td>
                        <td style={td}>
                          <input
                            style={{
                              ...input,
                              fontSize: 12,
                              maxWidth: 70,
                            }}
                            value={u.currency || "EUR"}
                            onChange={(e) =>
                              handleChangeUnit(
                                u.id,
                                "currency",
                                e.target.value
                              )
                            }
                          />
                        </td>
                        <td style={td}>
                          <button
                            type="button"
                            style={{
                              ...buttonPrimary,
                              padding: "4px 10px",
                              fontSize: 11,
                            }}
                            onClick={() => handleSaveUnit(u)}
                            disabled={savingUnitId === u.id}
                          >
                            {savingUnitId === u.id
                              ? "Salvataggio..."
                              : "Salva"}
                          </button>
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <h2 style={{ fontSize: 14, margin: 0 }}>
                  Extra & Commissioni (valori di default)
                </h2>
                <button
                  type="button"
                  style={infoButton}
                  aria-label="Info extra e commissioni"
                  onClick={() => setInfoModal("extras")}
                >
                  i
                </button>
              </div>
              <p
                style={{
                  fontSize: 11,
                  color: "#6b7280",
                  marginBottom: 8,
                }}
              >
                Questi valori non fissano i prezzi reali, ma sono suggerimenti
                che il portale può usare per precompilare le nuove prenotazioni
                (cleaning fee, tassa di soggiorno, commissioni canale).
              </p>
              <form
                onSubmit={handleSavePricing}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 12,
                }}
              >
                <div style={field}>
                  <label style={label}>
                    Cleaning fee predefinita per soggiorno
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    style={input}
                    value={
                      pricing.default_cleaning_fee == null
                        ? ""
                        : pricing.default_cleaning_fee
                    }
                    onChange={(e) =>
                      handleChangePricing(
                        "default_cleaning_fee",
                        e.target.value
                      )
                    }
                    placeholder="es. 20"
                  />
                </div>
                <div style={field}>
                  <label style={label}>
                    City tax per notte (totale, per booking)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    style={input}
                    value={
                      pricing.default_city_tax_per_night == null
                        ? ""
                        : pricing.default_city_tax_per_night
                    }
                    onChange={(e) =>
                      handleChangePricing(
                        "default_city_tax_per_night",
                        e.target.value
                      )
                    }
                    placeholder="es. 1.50"
                  />
                </div>
                <div style={field}>
                  <label style={label}>
                    Commissione canale (% sulla prenotazione)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    style={input}
                    value={
                      pricing.default_channel_fee_percent == null
                        ? ""
                        : pricing.default_channel_fee_percent
                    }
                    onChange={(e) =>
                      handleChangePricing(
                        "default_channel_fee_percent",
                        e.target.value
                      )
                    }
                    placeholder="es. 15"
                  />
                  <span
                    style={{
                      fontSize: 11,
                      color: "#6b7280",
                    }}
                  >
                    Usabile come default per Airbnb/Booking, poi correggi a mano
                    se necessario.
                  </span>
                </div>
                <div style={field}>
                  <label style={label}>Valuta di default</label>
                  <input
                    style={input}
                    value={pricing.default_currency || "EUR"}
                    onChange={(e) =>
                      handleChangePricing("default_currency", e.target.value)
                    }
                    maxLength={3}
                  />
                </div>

                <div
                  style={{
                    gridColumn: "1 / -1",
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    marginTop: 4,
                  }}
                >
                  <button
                    type="submit"
                    style={buttonPrimary}
                    disabled={savingPricing}
                  >
                    {savingPricing
                      ? "Salvataggio..."
                      : "Salva impostazioni"}
                  </button>
                  {msg && (
                    <span
                      style={{
                        fontSize: 11,
                        color: "#16a34a",
                      }}
                    >
                      {msg}
                    </span>
                  )}
                </div>
              </form>
            </div>
          )}
          <AppModal
            open={infoModal != null}
            onClose={() => setInfoModal(null)}
            title={infoModal === "base_rates" ? "Come impostare le tariffe base" : "Come usare extra e commissioni"}
            maxWidth={700}
          >
            {infoModal === "base_rates" ? (
              <div style={{ display: "grid", gap: 10, fontSize: 13, color: "#334155" }}>
                <p>
                  La tariffa base unità è il prezzo di partenza per notte usato dal portale quando
                  crei prenotazioni o calcoli suggerimenti in Business.
                </p>
                <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
                  <li>Inserisci il prezzo medio reale che vuoi ottenere.</li>
                  <li>Usa la stessa valuta su tutte le unità.</li>
                  <li>In prenotazione puoi sempre sovrascrivere manualmente il valore.</li>
                </ul>
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#f8fafc", padding: 10 }}>
                  Esempio: unità Atlas con base 95 EUR, 3 notti = 285 EUR base, poi sommi extra e tasse.
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10, fontSize: 13, color: "#334155" }}>
                <p>
                  Questi valori sono default che precompilano nuove prenotazioni e semplificano la
                  gestione operativa.
                </p>
                <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
                  <li>`cleaning fee`: costo fisso pulizia per soggiorno.</li>
                  <li>`city tax per night`: tassa soggiorno moltiplicata per notte.</li>
                  <li>`channel fee %`: commissione canale sul totale prenotazione.</li>
                </ul>
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#f8fafc", padding: 10 }}>
                  Esempio: totale 400 EUR con channel fee 15% = commissione stimata 60 EUR.
                </div>
              </div>
            )}
          </AppModal>
        </>
      )}
    </div>
  );
}

export default Pricing;
