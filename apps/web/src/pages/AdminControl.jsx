import { useEffect, useMemo, useState } from "react";
import { getCurrentUsername } from "../services/auth";
import {
  createUser,
  deleteUser,
  getPricingDefaults,
  getStaffDefaults,
  getStaffMembers,
  getUsers,
  resetUserPassword,
  updatePricingDefaults,
  updateStaffDefaults,
  updateUser,
} from "../services/api";

const USER_ROLES = ["owner", "manager", "operator", "viewer"];

function cardStyle(extra = {}) {
  return {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff",
    padding: 14,
    ...extra,
  };
}

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
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    role: "viewer",
    is_active: true,
  });
  const [passwordDrafts, setPasswordDrafts] = useState({});

  const currentUsername = (getCurrentUsername() || "").toLowerCase();

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [staffCfg, pricingCfg, members, usersRes] = await Promise.all([
        getStaffDefaults(),
        getPricingDefaults(),
        getStaffMembers({}),
        getUsers(),
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
      setUsers(usersRes || []);
    } catch (err) {
      setError(err.message || "Errore caricamento configurazione admin");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const ownersCount = useMemo(
    () => users.filter((u) => u.role === "owner" && u.is_active).length,
    [users]
  );

  async function saveStaffDefaults(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      await updateStaffDefaults({
        cleaning_default_assignee: staffDefaults.cleaning_default_assignee || null,
        cleaning_default_cost:
          staffDefaults.cleaning_default_cost === ""
            ? null
            : Number(staffDefaults.cleaning_default_cost),
        cleaning_default_hours:
          staffDefaults.cleaning_default_hours === ""
            ? null
            : Number(staffDefaults.cleaning_default_hours),
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
          pricingDefaults.default_cleaning_fee === ""
            ? null
            : Number(pricingDefaults.default_cleaning_fee),
        default_city_tax_per_night:
          pricingDefaults.default_city_tax_per_night === ""
            ? null
            : Number(pricingDefaults.default_city_tax_per_night),
        default_channel_fee_percent:
          pricingDefaults.default_channel_fee_percent === ""
            ? null
            : Number(pricingDefaults.default_channel_fee_percent),
        default_currency: pricingDefaults.default_currency || "EUR",
      });
      setMessage("Impostazioni pricing salvate.");
    } catch (err) {
      setError(err.message || "Errore salvataggio impostazioni pricing");
    }
  }

  async function handleCreateUser(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      await createUser({
        username: newUser.username.trim().toLowerCase(),
        password: newUser.password,
        role: newUser.role,
        is_active: newUser.is_active,
      });
      setNewUser({ username: "", password: "", role: "viewer", is_active: true });
      await loadData();
      setMessage("Utente creato con successo.");
    } catch (err) {
      setError(err.message || "Errore creazione utente");
    }
  }

  async function handleUpdateUser(userId, payload) {
    setError("");
    setMessage("");
    try {
      await updateUser(userId, payload);
      await loadData();
      setMessage("Utente aggiornato.");
    } catch (err) {
      setError(err.message || "Errore aggiornamento utente");
    }
  }

  async function handleResetPassword(userId) {
    const nextPassword = (passwordDrafts[userId] || "").trim();
    if (!nextPassword) {
      setError("Inserisci una nuova password.");
      return;
    }
    setError("");
    setMessage("");
    try {
      await resetUserPassword(userId, nextPassword);
      setPasswordDrafts((prev) => ({ ...prev, [userId]: "" }));
      setMessage("Password resettata.");
    } catch (err) {
      setError(err.message || "Errore reset password");
    }
  }

  async function handleDeleteUser(userId) {
    setError("");
    setMessage("");
    try {
      await deleteUser(userId);
      await loadData();
      setMessage("Utente eliminato.");
    } catch (err) {
      setError(err.message || "Errore eliminazione utente");
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Admin & Config</h1>
      <p style={{ color: "#6b7280" }}>
        Owner = superadmin tenant. Qui gestisci configurazioni operative e profili di accesso.
      </p>
      {loading && <p>Caricamento...</p>}
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      {message && <p style={{ color: "#047857" }}>{message}</p>}

      {!loading && (
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          }}
        >
          <form onSubmit={handleCreateUser} style={cardStyle()}>
            <h3 style={{ marginTop: 0 }}>User Management</h3>
            <p style={{ marginTop: -2, color: "#6b7280", fontSize: 13 }}>
              Crea utenti e assegna ruolo (`owner`, `manager`, `operator`, `viewer`).
            </p>
            <label>Username</label>
            <input
              value={newUser.username}
              onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
              required
            />
            <label>Password iniziale</label>
            <input
              type="password"
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              required
            />
            <label>Ruolo</label>
            <select
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
            >
              {USER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
              <input
                type="checkbox"
                checked={newUser.is_active}
                onChange={(e) =>
                  setNewUser({ ...newUser, is_active: e.target.checked })
                }
              />
              Attivo
            </label>
            <button type="submit" style={{ marginTop: 8, width: "100%" }}>
              Crea utente
            </button>
          </form>

          <form onSubmit={saveStaffDefaults} style={cardStyle()}>
            <h3 style={{ marginTop: 0 }}>Default Staff</h3>
            <label>Operatore default</label>
            <input
              value={staffDefaults.cleaning_default_assignee}
              onChange={(e) =>
                setStaffDefaults({
                  ...staffDefaults,
                  cleaning_default_assignee: e.target.value,
                })
              }
            />
            <label>Costo default</label>
            <input
              type="number"
              step="0.01"
              value={staffDefaults.cleaning_default_cost}
              onChange={(e) =>
                setStaffDefaults({
                  ...staffDefaults,
                  cleaning_default_cost: e.target.value,
                })
              }
            />
            <label>Ore default</label>
            <input
              type="number"
              step="0.25"
              value={staffDefaults.cleaning_default_hours}
              onChange={(e) =>
                setStaffDefaults({
                  ...staffDefaults,
                  cleaning_default_hours: e.target.value,
                })
              }
            />
            <label>Valuta</label>
            <input
              value={staffDefaults.currency}
              onChange={(e) =>
                setStaffDefaults({ ...staffDefaults, currency: e.target.value })
              }
            />
            <button type="submit" style={{ marginTop: 8 }}>
              Salva staff defaults
            </button>
          </form>

          <form onSubmit={savePricingDefaults} style={cardStyle()}>
            <h3 style={{ marginTop: 0 }}>Default Pricing</h3>
            <label>Cleaning fee default</label>
            <input
              type="number"
              step="0.01"
              value={pricingDefaults.default_cleaning_fee}
              onChange={(e) =>
                setPricingDefaults({
                  ...pricingDefaults,
                  default_cleaning_fee: e.target.value,
                })
              }
            />
            <label>City tax / notte</label>
            <input
              type="number"
              step="0.01"
              value={pricingDefaults.default_city_tax_per_night}
              onChange={(e) =>
                setPricingDefaults({
                  ...pricingDefaults,
                  default_city_tax_per_night: e.target.value,
                })
              }
            />
            <label>Commissione canale (%)</label>
            <input
              type="number"
              step="0.01"
              value={pricingDefaults.default_channel_fee_percent}
              onChange={(e) =>
                setPricingDefaults({
                  ...pricingDefaults,
                  default_channel_fee_percent: e.target.value,
                })
              }
            />
            <label>Valuta</label>
            <input
              value={pricingDefaults.default_currency}
              onChange={(e) =>
                setPricingDefaults({
                  ...pricingDefaults,
                  default_currency: e.target.value,
                })
              }
            />
            <button type="submit" style={{ marginTop: 8 }}>
              Salva pricing defaults
            </button>
          </form>

          <section style={cardStyle({ gridColumn: "1 / -1" })}>
            <h3 style={{ marginTop: 0 }}>Utenti tenant</h3>
            <p style={{ color: "#6b7280", fontSize: 13 }}>
              Owner attivi: {ownersCount}. L&apos;ultimo owner attivo non può essere rimosso/disattivato.
            </p>
            {users.length === 0 ? (
              <p style={{ color: "#6b7280" }}>Nessun utente.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 6 }}>Username</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 6 }}>Ruolo</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 6 }}>Attivo</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 6 }}>Password</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 6 }}>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const isCurrent = u.username.toLowerCase() === currentUsername;
                      return (
                        <tr key={u.id}>
                          <td style={{ borderBottom: "1px solid #f3f4f6", padding: 6 }}>
                            {u.username}
                            {isCurrent && (
                              <span
                                style={{
                                  marginLeft: 6,
                                  fontSize: 11,
                                  border: "1px solid #d1d5db",
                                  borderRadius: 999,
                                  padding: "1px 8px",
                                  color: "#4b5563",
                                }}
                              >
                                tu
                              </span>
                            )}
                          </td>
                          <td style={{ borderBottom: "1px solid #f3f4f6", padding: 6 }}>
                            <select
                              value={u.role}
                              onChange={(e) =>
                                handleUpdateUser(u.id, { role: e.target.value })
                              }
                            >
                              {USER_ROLES.map((role) => (
                                <option key={role} value={role}>
                                  {role}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={{ borderBottom: "1px solid #f3f4f6", padding: 6 }}>
                            <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                              <input
                                type="checkbox"
                                checked={u.is_active}
                                onChange={(e) =>
                                  handleUpdateUser(u.id, { is_active: e.target.checked })
                                }
                              />
                              {u.is_active ? "si" : "no"}
                            </label>
                          </td>
                          <td style={{ borderBottom: "1px solid #f3f4f6", padding: 6 }}>
                            <div style={{ display: "flex", gap: 8 }}>
                              <input
                                type="password"
                                placeholder="Nuova password"
                                value={passwordDrafts[u.id] || ""}
                                onChange={(e) =>
                                  setPasswordDrafts((prev) => ({
                                    ...prev,
                                    [u.id]: e.target.value,
                                  }))
                                }
                                style={{ minWidth: 150 }}
                              />
                              <button type="button" onClick={() => handleResetPassword(u.id)}>
                                Reset
                              </button>
                            </div>
                          </td>
                          <td style={{ borderBottom: "1px solid #f3f4f6", padding: 6 }}>
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u.id)}
                              disabled={isCurrent}
                              title={isCurrent ? "Non puoi eliminare il tuo utente corrente." : ""}
                            >
                              Elimina
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section style={cardStyle({ gridColumn: "1 / -1" })}>
            <h3 style={{ marginTop: 0 }}>Profili staff attuali</h3>
            <div style={{ marginBottom: 8 }}>
              <button type="button" onClick={loadData}>Aggiorna dati staff</button>
            </div>
            {staffMembers.length === 0 ? (
              <p style={{ color: "#6b7280" }}>Nessun membro staff.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 6 }}>ID</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 6 }}>Nome</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 6 }}>Ruolo</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 6 }}>Attivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...staffMembers]
                      .sort((a, b) => {
                        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
                        return (a.name || "").localeCompare(b.name || "");
                      })
                      .map((m) => (
                      <tr key={m.id}>
                        <td style={{ borderBottom: "1px solid #f3f4f6", padding: 6 }}>{m.id}</td>
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
