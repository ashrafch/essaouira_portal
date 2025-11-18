import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  getBookings,
  createBooking,
  getUnits,
  updateBooking,
  deleteBooking,
} from "../services/api";
import db from "../offline/dbLocal";

function addDaysIso(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function Bookings() {
  const location = useLocation();

  const [bookings, setBookings] = useState([]);
  const [units, setUnits] = useState([]);

  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    unit_id: "",
    guest_name: "",
    guest_email: "",
    source: "direct",
    checkin_date: "",
    checkout_date: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [editingId, setEditingId] = useState(null);

  const [filterUnit, setFilterUnit] = useState("");
  const [filterText, setFilterText] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [bks, uns] = await Promise.all([getBookings(), getUnits()]);
        setBookings(bks);
        setUnits(uns);
        setFromCache(false);
        await db.bookings.clear();
        await db.bookings.bulkPut(bks);
        await db.units.clear();
        await db.units.bulkPut(uns);
      } catch (err) {
        setError(err.message);
        const cachedBookings = await db.bookings.toArray();
        const cachedUnits = await db.units.toArray();
        setBookings(cachedBookings);
        setUnits(cachedUnits);
        setFromCache(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const unitMap = useMemo(
    () =>
      units.reduce((acc, u) => {
        acc[u.id] = u;
        return acc;
      }, {}),
    [units]
  );

  const today = new Date();

  const stats = useMemo(() => {
    const total = bookings.length;
    const future = bookings.filter(
      (b) => new Date(b.checkout_date) >= today
    ).length;
    const sourcesCount = bookings.reduce((acc, b) => {
      acc[b.source] = (acc[b.source] || 0) + 1;
      return acc;
    }, {});

    return { total, future, sourcesCount };
  }, [bookings, today]);

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (filterUnit && Number(filterUnit) !== b.unit_id) return false;
      if (filterText) {
        const text = filterText.toLowerCase();
        const unitName =
          unitMap[b.unit_id]?.name?.toLowerCase() ?? "";
        const guest = b.guest_name?.toLowerCase() ?? "";
        const notes = b.notes?.toLowerCase() ?? "";
        if (
          !guest.includes(text) &&
          !unitName.includes(text) &&
          !notes.includes(text)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [bookings, filterUnit, filterText, unitMap]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        ...form,
        unit_id: Number(form.unit_id),
      };

      if (editingId) {
        const updated = await updateBooking(editingId, payload);
        setBookings((prev) =>
          prev.map((b) => (b.id === editingId ? updated : b))
        );
        await db.bookings.put(updated);
      } else {
        const created = await createBooking(payload);
        setBookings((prev) => [...prev, created]);
        await db.bookings.put(created);
      }

      // reset form
      setForm((prev) => ({
        ...prev,
        guest_name: "",
        guest_email: "",
        checkin_date: "",
        checkout_date: "",
        notes: "",
      }));
      setEditingId(null);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(booking) {
    setEditingId(booking.id);
    setForm({
      unit_id: String(booking.unit_id),
      guest_name: booking.guest_name || "",
      guest_email: booking.guest_email || "",
      source: booking.source || "direct",
      checkin_date: booking.checkin_date,
      checkout_date: booking.checkout_date,
      notes: booking.notes || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(booking) {
    const confirmed = window.confirm(
      `Eliminare la prenotazione di ${booking.guest_name} per ${
        unitMap[booking.unit_id]?.name || `Unit #${booking.unit_id}`
      }?`
    );
    if (!confirmed) return;

    try {
      await deleteBooking(booking.id);
      setBookings((prev) => prev.filter((b) => b.id !== booking.id));
      await db.bookings.delete(booking.id);
    } catch (err) {
      alert("Errore durante l'eliminazione: " + err.message);
    }
  }

  function handleCancelEdit() {
    setEditingId(null);
    setForm((prev) => ({
      ...prev,
      guest_name: "",
      guest_email: "",
      checkin_date: "",
      checkout_date: "",
      notes: "",
    }));
  }

  // --- INTEGRAZIONE CON CALENDARIO ---
  useEffect(() => {
    const state = location.state || {};

    // Nuova prenotazione da un giorno specifico
    if (state.newBookingDate) {
      setEditingId(null);
      setForm((prev) => ({
        ...prev,
        checkin_date: state.newBookingDate,
        checkout_date:
          prev.checkout_date || addDaysIso(state.newBookingDate, 1),
      }));
    }

    // Modifica prenotazione specifica
    if (state.editBookingId && bookings.length > 0) {
      const b = bookings.find((bk) => bk.id === state.editBookingId);
      if (b) {
        handleEdit(b);
      }
    }
  }, [location.state, bookings]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- STILI ---

  const pageHeader = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 12,
    marginBottom: 20,
    flexWrap: "wrap",
  };

  const tagInfo = {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 999,
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    color: "#1d4ed8",
  };

  const tagOffline = {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 999,
    background: "#fffbeb",
    border: "1px solid #fbbf24",
    color: "#92400e",
  };

  const layout = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.9fr)",
    gap: 20,
    alignItems: "flex-start",
  };

  const card = {
    backgroundColor: "white",
    borderRadius: "14px",
    padding: "16px 18px",
    boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
    border: "1px solid #e5e7eb",
  };

  const statGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
    marginBottom: 16,
  };

  const statCard = {
    background: "#f9fafb",
    borderRadius: "12px",
    padding: "10px 12px",
  };

  const filterRow = {
    display: "flex",
    gap: 10,
    marginBottom: 12,
    flexWrap: "wrap",
  };

  const badgeSource = (source) => {
    const base = {
      fontSize: 11,
      padding: "3px 8px",
      borderRadius: 999,
      border: "1px solid transparent",
    };
    switch (source) {
      case "airbnb":
        return {
          ...base,
          background: "#fef3c7",
          color: "#92400e",
          borderColor: "#fde68a",
        };
      case "booking":
        return {
          ...base,
          background: "#eff6ff",
          color: "#1d4ed8",
          borderColor: "#bfdbfe",
        };
      case "direct":
      default:
        return {
          ...base,
          background: "#ecfdf5",
          color: "#047857",
          borderColor: "#bbf7d0",
        };
    }
  };

  const badgeDate = {
    fontSize: 11,
    padding: "3px 8px",
    borderRadius: 999,
    background: "#f3f4f6",
    color: "#4b5563",
  };

  const bookingCard = {
    borderRadius: "12px",
    border: "1px solid #e5e7eb",
    padding: "10px 12px",
    marginBottom: 10,
    background: "white",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  };

  const bookingHeader = {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "baseline",
  };

  const actionsRow = {
    display: "flex",
    gap: 6,
    marginTop: 4,
    justifyContent: "flex-end",
  };

  const smallButton = (variant = "primary") => ({
    fontSize: 11,
    padding: "4px 8px",
    borderRadius: 999,
    border: "none",
    cursor: "pointer",
    backgroundColor:
      variant === "primary"
        ? "#0f766e"
        : variant === "danger"
        ? "#b91c1c"
        : "#6b7280",
    color: "white",
  });

  return (
    <div>
      {/* HEADER */}
      <div style={pageHeader}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Prenotazioni</h1>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Gestisci le prenotazioni degli appartamenti e tieni sotto controllo
            l&apos;occupazione.
          </p>
        </div>

        <div style={{ textAlign: "right", fontSize: 12, color: "#6b7280" }}>
          <div style={{ marginBottom: 4 }}>
            Oggi è{" "}
            <strong>
              {today.toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
            </strong>
          </div>
          <span style={fromCache ? tagOffline : tagInfo}>
            {fromCache
              ? "Offline – dati da cache locale"
              : "Dati live dal server"}
          </span>
        </div>
      </div>

      {/* RIEPILOGO & FORM */}
      <div style={layout}>
        {/* COLONNA SINISTRA: RIEPILOGO + LISTA */}
        <div style={card}>
          <h2 style={{ fontSize: 16, marginBottom: 10 }}>Riepilogo</h2>

          <div style={statGrid}>
            <div style={statCard}>
              <div style={{ fontSize: 11, color: "#6b7280" }}>Totale</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{stats.total}</div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>
                Prenotazioni salvate in sistema
              </div>
            </div>

            <div style={statCard}>
              <div style={{ fontSize: 11, color: "#6b7280" }}>Future</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>
                {stats.future}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>
                Ancora attive da oggi in poi
              </div>
            </div>

            <div style={statCard}>
              <div style={{ fontSize: 11, color: "#6b7280" }}>Fonti</div>
              <div style={{ fontSize: 13, marginTop: 2 }}>
                {Object.keys(stats.sourcesCount).length === 0 ? (
                  <span style={{ color: "#9ca3af" }}>Nessuna fonte ancora</span>
                ) : (
                  Object.entries(stats.sourcesCount).map(([src, count]) => (
                    <div key={src} style={{ fontSize: 12 }}>
                      <strong>{src}</strong>: {count}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 6, marginBottom: 8 }}>
            <h3 style={{ fontSize: 14, marginBottom: 6 }}>Filtri</h3>
            <div style={filterRow}>
              <div style={{ flex: "1 1 150px" }}>
                <label style={{ fontSize: 12, color: "#6b7280" }}>
                  Cerca per ospite / appartamento / note
                </label>
                <input
                  style={{ marginTop: 2 }}
                  placeholder="Es. Mario, Unit A, capodanno..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                />
              </div>

              <div style={{ width: 200 }}>
                <label style={{ fontSize: 12, color: "#6b7280" }}>
                  Appartamento
                </label>
                <select
                  style={{ marginTop: 2 }}
                  value={filterUnit}
                  onChange={(e) => setFilterUnit(e.target.value)}
                >
                  <option value="">Tutti</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Lista prenotazioni</h3>

          {loading ? (
            <p>Caricamento prenotazioni...</p>
          ) : filteredBookings.length === 0 ? (
            <p style={{ fontSize: 13, color: "#6b7280" }}>
              Nessuna prenotazione trovata con i filtri attuali.
            </p>
          ) : (
            <div style={{ maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
              {filteredBookings
                .slice()
                .sort(
                  (a, b) =>
                    new Date(a.checkin_date) - new Date(b.checkin_date)
                )
                .map((b) => {
                  const unit = unitMap[b.unit_id];
                  const isPast =
                    new Date(b.checkout_date) < today;
                  return (
                    <div key={b.id} style={bookingCard}>
                      <div style={bookingHeader}>
                        <div>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 14,
                            }}
                          >
                            {b.guest_name}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "#6b7280",
                              marginTop: 2,
                            }}
                          >
                            {unit ? unit.name : `Unit #${b.unit_id}`}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", fontSize: 11 }}>
                          <div>
                            <span style={badgeDate}>
                              {new Date(
                                b.checkin_date
                              ).toLocaleDateString("it-IT")}{" "}
                              →{" "}
                              {new Date(
                                b.checkout_date
                              ).toLocaleDateString("it-IT")}
                            </span>
                          </div>
                          <div style={{ marginTop: 4 }}>
                            <span style={badgeSource(b.source)}>
                              {b.source === "direct"
                                ? "Diretta"
                                : b.source === "airbnb"
                                ? "Airbnb"
                                : b.source === "booking"
                                ? "Booking.com"
                                : b.source}
                            </span>
                            {!isPast && (
                              <span
                                style={{
                                  ...badgeDate,
                                  marginLeft: 6,
                                  background: "#ecfdf5",
                                  color: "#047857",
                                }}
                              >
                                Attiva / futura
                              </span>
                            )}
                            {isPast && (
                              <span
                                style={{
                                  ...badgeDate,
                                  marginLeft: 6,
                                  background: "#f3f4f6",
                                  color: "#6b7280",
                                }}
                              >
                                Passata
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {b.notes && (
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 12,
                            color: "#4b5563",
                          }}
                        >
                          {b.notes}
                        </div>
                      )}

                      {b.guest_email && (
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 11,
                            color: "#6b7280",
                          }}
                        >
                          {b.guest_email}
                        </div>
                      )}

                      <div style={actionsRow}>
                        <button
                          type="button"
                          style={smallButton("primary")}
                          onClick={() => handleEdit(b)}
                        >
                          Modifica
                        </button>
                        <button
                          type="button"
                          style={smallButton("danger")}
                          onClick={() => handleDelete(b)}
                        >
                          Elimina
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {error && !fromCache && (
            <p style={{ color: "red", fontSize: 12, marginTop: 8 }}>
              Errore caricamento: {error}
            </p>
          )}
        </div>

        {/* COLONNA DESTRA: FORM */}
        <div style={card}>
          <h2 style={{ fontSize: 16, marginBottom: 10 }}>
            {editingId ? "Modifica prenotazione" : "Nuova prenotazione"}
          </h2>
          <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
            {editingId
              ? "Stai modificando una prenotazione esistente. I cambi sono subito salvati."
              : "Inserisci rapidamente una nuova prenotazione per uno degli appartamenti."}
          </p>

          {saveError && (
            <p style={{ color: "red", fontSize: 12, marginBottom: 8 }}>
              {saveError}
            </p>
          )}

          <form
            onSubmit={handleSubmit}
            style={{ display: "grid", gap: 10, fontSize: 14 }}
          >
            <div>
              <label style={{ fontSize: 12, color: "#6b7280" }}>
                Appartamento
              </label>
              <select
                name="unit_id"
                value={form.unit_id}
                onChange={handleChange}
                required
                style={{ marginTop: 2 }}
              >
                <option value="">Seleziona...</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, color: "#6b7280" }}>
                Nome ospite
              </label>
              <input
                name="guest_name"
                value={form.guest_name}
                onChange={handleChange}
                required
                style={{ marginTop: 2 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, color: "#6b7280" }}>
                Email ospite
              </label>
              <input
                type="email"
                name="guest_email"
                value={form.guest_email}
                onChange={handleChange}
                style={{ marginTop: 2 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, color: "#6b7280" }}>Fonte</label>
              <select
                name="source"
                value={form.source}
                onChange={handleChange}
                style={{ marginTop: 2 }}
              >
                <option value="direct">Diretta</option>
                <option value="airbnb">Airbnb</option>
                <option value="booking">Booking.com</option>
                <option value="other">Altro</option>
              </select>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <div>
                <label style={{ fontSize: 12, color: "#6b7280" }}>
                  Check-in
                </label>
                <input
                  type="date"
                  name="checkin_date"
                  value={form.checkin_date}
                  onChange={handleChange}
                  required
                  style={{ marginTop: 2 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#6b7280" }}>
                  Check-out
                </label>
                <input
                  type="date"
                  name="checkout_date"
                  value={form.checkout_date}
                  onChange={handleChange}
                  required
                  style={{ marginTop: 2 }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, color: "#6b7280" }}>Note</label>
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={3}
                style={{ marginTop: 2, resize: "vertical" }}
                placeholder="Es. arrivo in tarda serata, intolleranze alimentari, ecc."
              />
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button type="submit" disabled={saving}>
                {saving
                  ? "Salvataggio..."
                  : editingId
                  ? "Aggiorna prenotazione"
                  : "Salva prenotazione"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  style={{
                    backgroundColor: "#6b7280",
                  }}
                >
                  Annulla modifica
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Bookings;
