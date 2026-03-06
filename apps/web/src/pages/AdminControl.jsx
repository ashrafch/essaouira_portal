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
import Modal from "../components/Modal";
import FeedbackMessage from "../components/FeedbackMessage";

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
  const [feedback, setFeedback] = useState({ type: "info", message: "" });

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

  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [staffDefaultsModalOpen, setStaffDefaultsModalOpen] = useState(false);
  const [pricingDefaultsModalOpen, setPricingDefaultsModalOpen] = useState(false);
  const [manageUserModalOpen, setManageUserModalOpen] = useState(false);

  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    role: "viewer",
    is_active: true,
  });

  const [editingUser, setEditingUser] = useState(null);
  const [userRoleDraft, setUserRoleDraft] = useState("viewer");
  const [userActiveDraft, setUserActiveDraft] = useState(true);
  const [userPasswordDraft, setUserPasswordDraft] = useState("");

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

  function openManageUserModal(user) {
    setEditingUser(user);
    setUserRoleDraft(user.role);
    setUserActiveDraft(Boolean(user.is_active));
    setUserPasswordDraft("");
    setManageUserModalOpen(true);
  }

  async function saveStaffDefaults(e) {
    e.preventDefault();
    setError("");
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
      setFeedback({ type: "success", message: "Impostazioni staff salvate." });
      setStaffDefaultsModalOpen(false);
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "Errore salvataggio impostazioni staff" });
    }
  }

  async function savePricingDefaults(e) {
    e.preventDefault();
    setError("");
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
      setFeedback({ type: "success", message: "Impostazioni pricing salvate." });
      setPricingDefaultsModalOpen(false);
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "Errore salvataggio impostazioni pricing" });
    }
  }

  async function handleCreateUser(e) {
    e.preventDefault();
    setError("");
    try {
      await createUser({
        username: newUser.username.trim().toLowerCase(),
        password: newUser.password,
        role: newUser.role,
        is_active: newUser.is_active,
      });
      setNewUser({ username: "", password: "", role: "viewer", is_active: true });
      await loadData();
      setFeedback({ type: "success", message: "Utente creato con successo." });
      setCreateUserModalOpen(false);
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "Errore creazione utente" });
    }
  }

  async function handleUpdateCurrentUser() {
    if (!editingUser) return;
    setError("");
    try {
      await updateUser(editingUser.id, {
        role: userRoleDraft,
        is_active: userActiveDraft,
      });
      await loadData();
      setFeedback({ type: "success", message: "Utente aggiornato." });
      setManageUserModalOpen(false);
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "Errore aggiornamento utente" });
    }
  }

  async function handleResetCurrentPassword() {
    if (!editingUser) return;
    const nextPassword = userPasswordDraft.trim();
    if (!nextPassword) {
      setFeedback({ type: "error", message: "Inserisci una nuova password." });
      return;
    }
    try {
      await resetUserPassword(editingUser.id, nextPassword);
      setUserPasswordDraft("");
      setFeedback({ type: "success", message: "Password resettata." });
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "Errore reset password" });
    }
  }

  async function handleDeleteCurrentUser() {
    if (!editingUser) return;
    const isCurrent = editingUser.username.toLowerCase() === currentUsername;
    if (isCurrent) {
      setFeedback({ type: "error", message: "Non puoi eliminare il tuo utente corrente." });
      return;
    }
    if (!window.confirm(`Eliminare utente ${editingUser.username}?`)) return;
    try {
      await deleteUser(editingUser.id);
      await loadData();
      setFeedback({ type: "success", message: "Utente eliminato." });
      setManageUserModalOpen(false);
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "Errore eliminazione utente" });
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
      <FeedbackMessage
        message={feedback.message}
        type={feedback.type}
        onClose={() => setFeedback({ type: "info", message: "" })}
      />

      {!loading && (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          <section style={cardStyle()}>
            <h3 style={{ marginTop: 0 }}>Configurazione rapida</h3>
            <p style={{ marginTop: -2, color: "#6b7280", fontSize: 13 }}>
              Tutte le modifiche si aprono in modale dedicata.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setCreateUserModalOpen(true)}>+ Crea utente</button>
              <button type="button" onClick={() => setStaffDefaultsModalOpen(true)}>Staff defaults</button>
              <button type="button" onClick={() => setPricingDefaultsModalOpen(true)}>Pricing defaults</button>
            </div>
          </section>

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
                              <span style={{ marginLeft: 6, fontSize: 11, border: "1px solid #d1d5db", borderRadius: 999, padding: "1px 8px", color: "#4b5563" }}>
                                tu
                              </span>
                            )}
                          </td>
                          <td style={{ borderBottom: "1px solid #f3f4f6", padding: 6 }}>{u.role}</td>
                          <td style={{ borderBottom: "1px solid #f3f4f6", padding: 6 }}>{u.is_active ? "si" : "no"}</td>
                          <td style={{ borderBottom: "1px solid #f3f4f6", padding: 6 }}>
                            <button type="button" onClick={() => openManageUserModal(u)}>Gestisci</button>
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

      <Modal open={createUserModalOpen} title="Crea utente" onClose={() => setCreateUserModalOpen(false)} width={560}>
        <form onSubmit={handleCreateUser} style={{ display: "grid", gap: 8 }}>
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
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <input
              type="checkbox"
              checked={newUser.is_active}
              onChange={(e) => setNewUser({ ...newUser, is_active: e.target.checked })}
            />
            Attivo
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" onClick={() => setCreateUserModalOpen(false)}>Annulla</button>
            <button type="submit">Crea utente</button>
          </div>
        </form>
      </Modal>

      <Modal open={staffDefaultsModalOpen} title="Default Staff" onClose={() => setStaffDefaultsModalOpen(false)} width={620}>
        <form onSubmit={saveStaffDefaults} style={{ display: "grid", gap: 8 }}>
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
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" onClick={() => setStaffDefaultsModalOpen(false)}>Annulla</button>
            <button type="submit">Salva staff defaults</button>
          </div>
        </form>
      </Modal>

      <Modal open={pricingDefaultsModalOpen} title="Default Pricing" onClose={() => setPricingDefaultsModalOpen(false)} width={620}>
        <form onSubmit={savePricingDefaults} style={{ display: "grid", gap: 8 }}>
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
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" onClick={() => setPricingDefaultsModalOpen(false)}>Annulla</button>
            <button type="submit">Salva pricing defaults</button>
          </div>
        </form>
      </Modal>

      <Modal
        open={manageUserModalOpen}
        title={editingUser ? `Gestisci utente ${editingUser.username}` : "Gestisci utente"}
        onClose={() => setManageUserModalOpen(false)}
        width={620}
      >
        {editingUser ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label>Ruolo</label>
              <select value={userRoleDraft} onChange={(e) => setUserRoleDraft(e.target.value)}>
                {USER_ROLES.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={userActiveDraft}
                  onChange={(e) => setUserActiveDraft(e.target.checked)}
                />
                Attivo
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={handleUpdateCurrentUser}>Salva profilo</button>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid #e5e7eb" }} />

            <div style={{ display: "grid", gap: 6 }}>
              <label>Nuova password</label>
              <input
                type="password"
                placeholder="Nuova password"
                value={userPasswordDraft}
                onChange={(e) => setUserPasswordDraft(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
              <button type="button" onClick={handleResetCurrentPassword}>Reset password</button>
              <button type="button" onClick={handleDeleteCurrentUser}>Elimina utente</button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

export default AdminControl;
