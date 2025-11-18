import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  getBookings,
  getUnits,
  createBooking,
  updateBooking,
  deleteBooking,
} from "../services/api";

function formatDate(d) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function diffNights(checkin, checkout) {
  if (!checkin || !checkout) return 0;
  const ms = checkout.getTime() - checkin.getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function Bookings() {
  const location = useLocation();
  const [units, setUnits] = useState([]);
  const [bookings, setBookings] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [formMode, setFormMode] = useState("create"); // "create" | "edit"
  const [editingId, setEditingId] = useState(null);

  // form state
  const [unitId, setUnitId] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [source, setSource] = useState("direct");
  const [checkinDate, setCheckinDate] = useState("");
  const [checkoutDate, setCheckoutDate] = useState("");
  const [notes, setNotes] = useState("");

  const [nightlyRate, setNightlyRate] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [cleaningFee, setCleaningFee] = useState("");
  const [cityTax, setCityTax] = useState("");
  const [channelFee, setChannelFee] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [isPaid, setIsPaid] = useState(false);

  // inizializzazione dati
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [bks, uns] = await Promise.all([getBookings(), getUnits()]);
        setBookings(bks);
        setUnits(uns);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // se vengo dal calendario con un giorno pre-selezionato o booking da modificare
  useEffect(() => {
    const state = location.state;
    if (!state) return;

    // nuova prenotazione a partire da un giorno
    if (state.newBookingDate) {
      const d = state.newBookingDate;
      setFormMode("create");
      setEditingId(null);
      setCheckinDate(d);
      setCheckoutDate(d); // l'utente poi sistema
    }

    // modifica prenotazione
    if (state.editBookingId && bookings.length > 0) {
      const b = bookings.find((bk) => bk.id === state.editBookingId);
      if (b) {
        loadBookingIntoForm(b);
      }
    }
  }, [location.state, bookings]);

  const unitMap = useMemo(
    () =>
      units.reduce((acc, u) => {
        acc[u.id] = u;
        return acc;
      }, {}),
    [units]
  );

  const parsedCheckin = parseDate(checkinDate);
  const parsedCheckout = parseDate(checkoutDate);
  const nights = diffNights(parsedCheckin, parsedCheckout);

  const suggestedTotal = useMemo(() => {
    const nr = nightlyRate ? Number(nightlyRate) : NaN;
    const cf = cleaningFee ? Number(cleaningFee) : 0;
    const ct = cityTax ? Number(cityTax) : 0;
    const chf = channelFee ? Number(channelFee) : 0;

    if (!nights || Number.isNaN(nr)) return null;
    const total = nr * nights + cf + ct + chf;
    return total;
  }, [nightlyRate, nights, cleaningFee, cityTax, channelFee]);

  function resetForm() {
    setFormMode("create");
    setEditingId(null);
    setUnitId(units[0]?.id ? String(units[0].id) : "");
    setGuestName("");
    setGuestEmail("");
    setSource("direct");
    setCheckinDate("");
    setCheckoutDate("");
    setNotes("");
    setNightlyRate("");
    setTotalPrice("");
    setCleaningFee("");
    setCityTax("");
    setChannelFee("");
    setCurrency("EUR");
    setIsPaid(false);
  }

  function loadBookingIntoForm(b) {
    setFormMode("edit");
    setEditingId(b.id);
    setUnitId(String(b.unit_id));
    setGuestName(b.guest_name || "");
    setGuestEmail(b.guest_email || "");
    setSource(b.source || "direct");
    setCheckinDate(formatDate(b.checkin_date));
    setCheckoutDate(formatDate(b.checkout_date));
    setNotes(b.notes || "");
    setNightlyRate(
      b.nightly_rate != null && b.nightly_rate !== undefined
        ? String(b.nightly_rate)
        : ""
    );
    setTotalPrice(
      b.total_price != null && b.total_price !== undefined
        ? String(b.total_price)
        : ""
    );
    setCleaningFee(
      b.cleaning_fee != null && b.cleaning_fee !== undefined
        ? String(b.cleaning_fee)
        : ""
    );
    setCityTax(
      b.city_tax != null && b.city_tax !== undefined
        ? String(b.city_tax)
        : ""
    );
    setChannelFee(
      b.channel_fee != null && b.channel_fee !== undefined
        ? String(b.channel_fee)
        : ""
    );
    setCurrency(b.currency || "EUR");
    setIsPaid(Boolean(b.is_paid));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!unitId || !guestName || !checkinDate || !checkoutDate) {
      alert("Unità, ospite, check-in e check-out sono obbligatori.");
      return;
    }

    const payload = {
      unit_id: Number(unitId),
      guest_name: guestName,
      guest_email: guestEmail || null,
      source,
      checkin_date: checkinDate,
      checkout_date: checkoutDate,
      notes: notes || null,
      nightly_rate: nightlyRate !== "" ? Number(nightlyRate) : null,
      total_price: totalPrice !== "" ? Number(totalPrice) : null,
      cleaning_fee: cleaningFee !== "" ? Number(cleaningFee) : null,
      city_tax: cityTax !== "" ? Number(cityTax) : null,
      channel_fee: channelFee !== "" ? Number(channelFee) : null,
      currency,
      is_paid: isPaid,
    };

    setSaving(true);
    setError(null);
    try {
      let saved;
      if (formMode === "edit" && editingId != null) {
        saved = await updateBooking(editingId, payload);
        setBookings((prev) =>
          prev.map((b) => (b.id === saved.id ? saved : b))
        );
      } else {
        saved = await createBooking(payload);
        setBookings((prev) => [...prev, saved]);
      }
      resetForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Sei sicuro di voler eliminare questa prenotazione?"))
      return;
    try {
      await deleteBooking(id);
      setBookings((prev) => prev.filter((b) => b.id !== id));
      if (editingId === id) {
        resetForm();
      }
    } catch (err) {
      alert("Errore eliminando la prenotazione: " + err.message);
    }
  }

  const container = {
    display: "grid",
    gridTemplateColumns: "minmax(260px, 320px) 1fr",
    gap: 16,
    alignItems: "flex-start",
  };

  const card = {
    backgroundColor: "white",
    borderRadius: "14px",
    padding: "16px 18px",
    boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
    border: "1px solid #e5e7eb",
  };

  const field = {
    marginBottom: 10,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  };

  const label = {
    fontSize: 12,
    fontWeight: 500,
    color: "#374151",
  };

  const input = {
    borderRadius: 8,
    border: "1px solid #d1d5db",
    padding: "6px 8px",
    fontSize: 13,
  };

  const textarea = {
    ...input,
    minHeight: 60,
    resize: "vertical",
  };

  const select = {
    ...input,
  };

  const buttonPrimary = {
    borderRadius: 999,
    border: "none",
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    backgroundColor: "#0f766e",
    color: "white",
    cursor: "pointer",
  };

  const buttonSecondary = {
    borderRadius: 999,
    border: "1px solid #d1d5db",
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 500,
    backgroundColor: "white",
    color: "#374151",
    cursor: "pointer",
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
    fontSize: 12,
  };

  const td = {
    padding: "6px 4px",
    borderBottom: "1px solid #f3f4f6",
  };

  const pillPaid = (paid) => ({
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 500,
    backgroundColor: paid ? "#dcfce7" : "#fee2e2",
    color: paid ? "#166534" : "#b91c1c",
    border: `1px solid ${paid ? "#16a34a" : "#ef4444"}`,
  });

  const header = {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 16,
    alignItems: "flex-end",
  };

  return (
    <div>
      <div style={header}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Prenotazioni</h1>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Gestisci le prenotazioni con informazioni economiche complete.
          </p>
        </div>
      </div>

      {error && (
        <p style={{ color: "red", fontSize: 12, marginBottom: 8 }}>{error}</p>
      )}

      {loading ? (
        <p>Caricamento prenotazioni...</p>
      ) : (
        <div style={container}>
          {/* FORM */}
          <div style={card}>
            <h2 style={{ fontSize: 14, marginBottom: 10 }}>
              {formMode === "create"
                ? "Nuova prenotazione"
                : `Modifica prenotazione #${editingId}`}
            </h2>

            <form onSubmit={handleSubmit}>
              {/* DATI BASE */}
              <div style={field}>
                <label style={label}>Appartamento</label>
                <select
                  style={select}
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                >
                  <option value="">Seleziona...</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={field}>
                <label style={label}>Ospite</label>
                <input
                  style={input}
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Nome dell'ospite"
                />
              </div>

              <div style={field}>
                <label style={label}>Email ospite (opzionale)</label>
                <input
                  style={input}
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="email@example.com"
                />
              </div>

              <div style={field}>
                <label style={label}>Canale</label>
                <select
                  style={select}
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
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
                  gap: 8,
                }}
              >
                <div style={field}>
                  <label style={label}>Check-in</label>
                  <input
                    style={input}
                    type="date"
                    value={checkinDate}
                    onChange={(e) => setCheckinDate(e.target.value)}
                  />
                </div>
                <div style={field}>
                  <label style={label}>Check-out</label>
                  <input
                    style={input}
                    type="date"
                    value={checkoutDate}
                    onChange={(e) => setCheckoutDate(e.target.value)}
                  />
                </div>
              </div>

              {nights > 0 && (
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>
                  Notti: <strong>{nights}</strong>
                </div>
              )}

              {/* SEZIONE ECONOMICA */}
              <hr style={{ margin: "10px 0 8px", borderColor: "#e5e7eb" }} />
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                Dettagli economici
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                <div style={field}>
                  <label style={label}>Tariffa per notte</label>
                  <input
                    style={input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={nightlyRate}
                    onChange={(e) => setNightlyRate(e.target.value)}
                    placeholder="es. 80"
                  />
                </div>
                <div style={field}>
                  <label style={label}>Totale prenotazione</label>
                  <input
                    style={input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={totalPrice}
                    onChange={(e) => setTotalPrice(e.target.value)}
                    placeholder="lascia vuoto per calcolo automatico"
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                <div style={field}>
                  <label style={label}>Cleaning fee</label>
                  <input
                    style={input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={cleaningFee}
                    onChange={(e) => setCleaningFee(e.target.value)}
                    placeholder="es. 20"
                  />
                </div>
                <div style={field}>
                  <label style={label}>Tassa di soggiorno</label>
                  <input
                    style={input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={cityTax}
                    onChange={(e) => setCityTax(e.target.value)}
                    placeholder="es. 8"
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                <div style={field}>
                  <label style={label}>Commissioni canale</label>
                  <input
                    style={input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={channelFee}
                    onChange={(e) => setChannelFee(e.target.value)}
                    placeholder="es. 15"
                  />
                </div>
                <div style={field}>
                  <label style={label}>Valuta</label>
                  <select
                    style={select}
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    <option value="EUR">EUR</option>
                    <option value="MAD">MAD</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>

              {suggestedTotal != null && totalPrice === "" && (
                <div
                  style={{
                    fontSize: 11,
                    color: "#6b7280",
                    marginBottom: 8,
                  }}
                >
                  Totale stimato:{" "}
                  <strong>
                    {currency} {suggestedTotal.toFixed(2)}
                  </strong>{" "}
                  (notti × tariffa + extra).
                  <br />
                  Puoi lasciare vuoto il campo totale per usare questo valore
                  calcolato automaticamente.
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 10,
                }}
              >
                <input
                  id="isPaid"
                  type="checkbox"
                  checked={isPaid}
                  onChange={(e) => setIsPaid(e.target.checked)}
                />
                <label htmlFor="isPaid" style={{ fontSize: 12, color: "#374151" }}>
                  Pagata
                </label>
              </div>

              <div style={field}>
                <label style={label}>Note interne</label>
                <textarea
                  style={textarea}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Note per te / staff (non visibili all'ospite)"
                />
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 10,
                }}
              >
                <button
                  type="submit"
                  style={buttonPrimary}
                  disabled={saving}
                >
                  {saving
                    ? "Salvataggio..."
                    : formMode === "create"
                    ? "Crea prenotazione"
                    : "Salva modifiche"}
                </button>
                {formMode === "edit" && (
                  <button
                    type="button"
                    style={buttonSecondary}
                    onClick={resetForm}
                  >
                    Annulla modifica
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* LISTA PRENOTAZIONI */}
          <div style={card}>
            <h2 style={{ fontSize: 14, marginBottom: 8 }}>
              Elenco prenotazioni
            </h2>
            {bookings.length === 0 ? (
              <p style={{ fontSize: 13, color: "#6b7280" }}>
                Nessuna prenotazione registrata.
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Ospite</th>
                      <th style={th}>Unità</th>
                      <th style={th}>Date</th>
                      <th style={th}>Notti</th>
                      <th style={th}>Totale</th>
                      <th style={th}>Canale</th>
                      <th style={th}>Stato</th>
                      <th style={th}>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings
                      .slice()
                      .sort(
                        (a, b) =>
                          new Date(a.checkin_date) - new Date(b.checkin_date)
                      )
                      .map((b) => {
                        const unit = unitMap[b.unit_id];
                        const cIn = parseDate(b.checkin_date);
                        const cOut = parseDate(b.checkout_date);
                        const n = diffNights(cIn, cOut);
                        const total =
                          b.total_price != null
                            ? Number(b.total_price)
                            : b.nightly_rate != null
                            ? Number(b.nightly_rate) * n
                            : null;

                        return (
                          <tr key={b.id}>
                            <td style={td}>{b.guest_name}</td>
                            <td style={td}>{unit?.name || `Unit #${b.unit_id}`}</td>
                            <td style={td}>
                              {cIn?.toLocaleDateString("it-IT")} →{" "}
                              {cOut?.toLocaleDateString("it-IT")}
                            </td>
                            <td style={td}>{n}</td>
                            <td style={td}>
                              {total != null ? (
                                <>
                                  {b.currency || "EUR"} {total.toFixed(2)}
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td style={td}>
                              {b.source === "direct"
                                ? "Diretta"
                                : b.source === "airbnb"
                                ? "Airbnb"
                                : b.source === "booking"
                                ? "Booking.com"
                                : b.source || "—"}
                            </td>
                            <td style={td}>
                              <span style={pillPaid(b.is_paid)}>
                                {b.is_paid ? "Pagata" : "Da incassare"}
                              </span>
                            </td>
                            <td style={{ ...td, whiteSpace: "nowrap" }}>
                              <button
                                type="button"
                                style={{
                                  ...buttonSecondary,
                                  padding: "4px 10px",
                                  fontSize: 12,
                                }}
                                onClick={() => loadBookingIntoForm(b)}
                              >
                                Modifica
                              </button>{" "}
                              <button
                                type="button"
                                style={{
                                  ...buttonSecondary,
                                  padding: "4px 10px",
                                  fontSize: 12,
                                  borderColor: "#fecaca",
                                  color: "#b91c1c",
                                }}
                                onClick={() => handleDelete(b.id)}
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
          </div>
        </div>
      )}
    </div>
  );
}

export default Bookings;
