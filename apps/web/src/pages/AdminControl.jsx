import { useEffect, useState } from "react";
import {
  getPricingDefaults,
  getStaffDefaults,
  getStaffMembers,
  updatePricingDefaults,
  updateStaffDefaults,
} from "../services/api";

function AdminControl() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [staffDefaults, setStaffDefaults] = useState({
    cleaning_default_assignee: "",
    cleaning_default_cost: "",
    cleaning_default_hours: "",
    currency: "EUR",
  });
  const [pricingDefaults, setPricingDefaults] = useState({
    default_cleaning_fee: "",
    default_city_tax_per_night: "",
    default_channel_fee_percent: "",
    default_currency: "EUR",
  });
  const [staffMembers, setStaffMembers] = useState([]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [staffCfg, pricingCfg, members] = await Promise.all([
        getStaffDefaults(),
        getPricingDefaults(),
        getStaffMembers(),
      ]);
      setStaffDefaults({
        cleaning_default_assignee: staffCfg.cleaning_default_assignee || "",
        cleaning_default_cost: staffCfg.cleaning_default_cost ?? "",
        cleaning_default_hours: staffCfg.cleaning_default_hours ?? "",
        currency: staffCfg.currency || "EUR",
      });
      setPricingDefaults({
        default_cleaning_fee: pricingCfg.default_cleaning_fee ?? "",
        default_city_tax_per_night: pricingCfg.default_city_tax_per_night ?? "",
        default_channel_fee_percent: pricingCfg.default_channel_fee_percent ?? "",
        default_currency: pricingCfg.default_currency || "EUR",
      });
      setStaffMembers(members || []);
    } catch (err) {
      setError(err.message || "Errore caricamento configurazione admin");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function saveStaffDefaults(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      await updateStaffDefaults({
        cleaning_default_assignee: staffDefaults.cleaning_default_assignee || null,
        cleaning_default_cost:
          staffDefaults.cleaning_default_cost === "" ? null : Number(staffDefaults.cleaning_default_cost),
        cleaning_default_hours:
          staffDefaults.cleaning_default_hours === "" ? null : Number(staffDefaults.cleaning_default_hours),
        currency: staffDefaults.currency || "EUR",
      });
      setMessage("Impostazioni staff salvate.");
    } catch (err) {
      setError(err.message || "Errore salvataggio impostazioni staff");
    }
  }

  async function savePricingDefaults(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      await updatePricingDefaults({
        default_cleaning_fee:
          pricingDefaults.default_cleaning_fee === "" ? null : Number(pricingDefaults.default_cleaning_fee),
        default_city_tax_per_night:
          pricingDefaults.default_city_tax_per_night === "" ? null : Number(pricingDefaults.default_city_tax_per_night),
        default_channel_fee_percent:
          pricingDefaults.default_channel_fee_percent === "" ? null : Number(pricingDefaults.default_channel_fee_percent),
        default_currency: pricingDefaults.default_currency || "EUR",
      });
      setMessage("Impostazioni pricing salvate.");
    } catch (err) {
      setError(err.message || "Errore salvataggio impostazioni pricing");
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Admin & Config</h1>
      <p style={{ color: "#6b7280" }}>
        Qui trovi le configurazioni operative disponibili in questa versione (profili staff e default operativi).
      </p>
      {loading && <p>Caricamento...</p>}
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      {message && <p style={{ color: "#047857" }}>{message}</p>}

      {!loading && (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          <form onSubmit={saveStaffDefaults} style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 14 }}>
            <h3 style={{ marginTop: 0 }}>Default Staff</h3>
            <label>Operatore default</label>
            <input
              value={staffDefaults.cleaning_default_assignee}
              onChange={(e) => setStaffDefaults({ ...staffDefaults, cleaning_default_assignee: e.target.value })}
            />
            <label>Costo default</label>
            <input
              type="number"
              step="0.01"
              value={staffDefaults.cleaning_default_cost}
              onChange={(e) => setStaffDefaults({ ...staffDefaults, cleaning_default_cost: e.target.value })}
            />
            <label>Ore default</label>
            <input
              type="number"
              step="0.25"
              value={staffDefaults.cleaning_default_hours}
              onChange={(e) => setStaffDefaults({ ...staffDefaults, cleaning_default_hours: e.target.value })}
            />
            <label>Valuta</label>
            <input
              value={staffDefaults.currency}
              onChange={(e) => setStaffDefaults({ ...staffDefaults, currency: e.target.value })}
            />
            <button type="submit" style={{ marginTop: 8 }}>Salva staff defaults</button>
          </form>

          <form onSubmit={savePricingDefaults} style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 14 }}>
            <h3 style={{ marginTop: 0 }}>Default Pricing</h3>
            <label>Cleaning fee default</label>
            <input
              type="number"
              step="0.01"
              value={pricingDefaults.default_cleaning_fee}
              onChange={(e) => setPricingDefaults({ ...pricingDefaults, default_cleaning_fee: e.target.value })}
            />
            <label>City tax / notte</label>
            <input
              type="number"
              step="0.01"
              value={pricingDefaults.default_city_tax_per_night}
              onChange={(e) => setPricingDefaults({ ...pricingDefaults, default_city_tax_per_night: e.target.value })}
            />
            <label>Commissione canale (%)</label>
            <input
              type="number"
              step="0.01"
              value={pricingDefaults.default_channel_fee_percent}
              onChange={(e) => setPricingDefaults({ ...pricingDefaults, default_channel_fee_percent: e.target.value })}
            />
            <label>Valuta</label>
            <input
              value={pricingDefaults.default_currency}
              onChange={(e) => setPricingDefaults({ ...pricingDefaults, default_currency: e.target.value })}
            />
            <button type="submit" style={{ marginTop: 8 }}>Salva pricing defaults</button>
          </form>

          <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 14, gridColumn: "1 / -1" }}>
            <h3 style={{ marginTop: 0 }}>Profili staff attuali</h3>
            {staffMembers.length === 0 ? (
              <p style={{ color: "#6b7280" }}>Nessun membro staff.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 6 }}>Nome</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 6 }}>Ruolo</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 6 }}>Attivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffMembers.map((m) => (
                      <tr key={m.id}>
                        <td style={{ borderBottom: "1px solid #f3f4f6", padding: 6 }}>{m.name}</td>
                        <td style={{ borderBottom: "1px solid #f3f4f6", padding: 6 }}>{m.role || "-"}</td>
                        <td style={{ borderBottom: "1px solid #f3f4f6", padding: 6 }}>{m.is_active ? "si" : "no"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default AdminControl;
