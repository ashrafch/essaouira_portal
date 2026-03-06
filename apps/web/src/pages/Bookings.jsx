import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  getBookings,
  getUnits,
  createBooking,
  updateBooking,
  deleteBooking,
} from "../services/api";
import FeedbackMessage from "../components/FeedbackMessage";

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

function hasOverlap(b, start, end) {
  const bIn = parseDate(b.checkin_date);
  const bOut = parseDate(b.checkout_date);
  if (!bIn || !bOut) return false;
  return bIn < end && bOut > start;
}

function Bookings() {
  const location = useLocation();

  const [units, setUnits] = useState([]);
  const [bookings, setBookings] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState({ type: "info", message: "" });
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [formMode, setFormMode] = useState("create"); // "create" | "edit"
  const [editingId, setEditingId] = useState(null);

  // form state
  const [unitId, setUnitId] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  
  // NUOVI CAMPI OSPITE
  const [guestPhone, setGuestPhone] = useState("");
  const [numAdults, setNumAdults] = useState("2");
  const [numChildren, setNumChildren] = useState("0");
  const [arrivalTime, setArrivalTime] = useState("");

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
  const [hasLateCheckout, setHasLateCheckout] = useState(false);

  // filtri lista destra
  const [unitFilter, setUnitFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all"); // all | paid | unpaid

  // init data
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [bks, uns] = await Promise.all([getBookings(), getUnits()]);
        setBookings(bks);
        setUnits(uns);
        if (uns[0]?.id) {
          setUnitId((prev) => prev || String(uns[0].id));
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // stato da Calendar (nuova o modifica)
  useEffect(() => {
    const state = location.state;
    if (!state) return;

    if (state.newBookingDate) {
      const d = state.newBookingDate;
      setFormMode("create");
      setEditingId(null);
      setCheckinDate(d);
      setCheckoutDate(d);
      setIsModalOpen(true);
    }

    if (state.editBookingId && bookings.length > 0) {
      const b = bookings.find((bk) => bk.id === state.editBookingId);
      if (b) {
        loadBookingIntoForm(b);
        setIsModalOpen(true);
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

  // ---- disponibilità / conflitti per intervallo selezionato ----
  const availability = useMemo(() => {
    if (!parsedCheckin || !parsedCheckout || units.length === 0) {
      return {
        freeUnits: [],
        occupiedUnits: [],
        conflictForSelectedUnit: false,
        conflictBookings: [],
      };
    }

    const freeUnits = [];
    const occupiedUnits = [];
    let conflictForSelectedUnit = false;
    const conflictBookings = [];

    const selectedIdNum = unitId ? Number(unitId) : null;

    units.forEach((u) => {
      const conflictsForUnit = bookings.filter((b) =>
        b.unit_id === u.id ? hasOverlap(b, parsedCheckin, parsedCheckout) : false
      );
      if (conflictsForUnit.length === 0) {
        freeUnits.push(u);
      } else {
        occupiedUnits.push(u);
      }

      if (selectedIdNum && u.id === selectedIdNum && conflictsForUnit.length > 0) {
        conflictForSelectedUnit = true;
        conflictBookings.push(...conflictsForUnit);
      }
    });

    return {
      freeUnits,
      occupiedUnits,
      conflictForSelectedUnit,
      conflictBookings,
    };
  }, [bookings, units, parsedCheckin, parsedCheckout, unitId]);

  const suggestedTotal = useMemo(() => {
    const nr = nightlyRate ? Number(nightlyRate) : NaN;
    const cf = cleaningFee ? Number(cleaningFee) : 0;
    const ct = cityTax ? Number(cityTax) : 0;
    const chf = channelFee ? Number(channelFee) : 0;

    if (!nights || Number.isNaN(nr)) return null;
    const total = nr * nights + cf + ct + chf;
    return total;
  }, [nightlyRate, nights, cleaningFee, cityTax, channelFee]);

  const filteredBookings = useMemo(() => {
    return bookings
      .filter((b) => {
        if (unitFilter !== "all" && String(b.unit_id) !== unitFilter) {
          return false;
        }
        if (paymentFilter === "paid" && !b.is_paid) return false;
        if (paymentFilter === "unpaid" && b.is_paid) return false;
        return true;
      })
      .slice()
      .sort((a, b) => {
        const aDate = new Date(a.checkin_date || a.checkout_date).getTime();
        const bDate = new Date(b.checkin_date || b.checkout_date).getTime();
        return aDate - bDate;
      });
  }, [bookings, unitFilter, paymentFilter]);

  const shownCount = filteredBookings.length;
  const totalCount = bookings.length;

  function resetForm() {
    setFormMode("create");
    setEditingId(null);
    setGuestName("");
    setGuestEmail("");
    
    // Reset nuovi campi
    setGuestPhone("");
    setNumAdults("2");
    setNumChildren("0");
    setArrivalTime("");

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
    setHasLateCheckout(false);
    if (units[0]?.id) {
      setUnitId(String(units[0].id));
    } else {
      setUnitId("");
    }
  }

  function openCreateModal() {
    resetForm();
    setIsModalOpen(true);
  }

  function loadBookingIntoForm(b) {
    setFormMode("edit");
    setEditingId(b.id);
    setUnitId(String(b.unit_id));
    setGuestName(b.guest_name || "");
    setGuestEmail(b.guest_email || "");
    
    // Load nuovi campi
    setGuestPhone(b.guest_phone || "");
    setNumAdults(b.num_adults != null ? String(b.num_adults) : "2");
    setNumChildren(b.num_children != null ? String(b.num_children) : "0");
    // arrival time potrebbe arrivare come "HH:MM:SS" o "HH:MM"
    setArrivalTime(b.estimated_arrival_time ? String(b.estimated_arrival_time).slice(0,5) : "");

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
      b.city_tax != null && b.city_tax !== undefined ? String(b.city_tax) : ""
    );
    setChannelFee(
      b.channel_fee != null && b.channel_fee !== undefined
        ? String(b.channel_fee)
        : ""
    );
    setCurrency(b.currency || "EUR");
    setIsPaid(Boolean(b.is_paid));
    setHasLateCheckout(Boolean(b.has_late_checkout));
  }

  // Funzione per aprire la pagina di stampa
  function openDocument(b) {
    window.open(`/bookings/${b.id}/document`, "_blank");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!unitId || !guestName || !checkinDate || !checkoutDate) {
      setFeedback({
        type: "error",
        message: "Unità, ospite, check-in e check-out sono obbligatori.",
      });
      return;
    }

    const payload = {
      unit_id: Number(unitId),
      guest_name: guestName,
      guest_email: guestEmail || null,
      
      // Nuovi payload
      guest_phone: guestPhone || null,
      num_adults: Number(numAdults) || 1,
      num_children: Number(numChildren) || 0,
      estimated_arrival_time: arrivalTime || null,

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
      has_late_checkout: hasLateCheckout,
    };

    setSaving(true);
    setError(null);
    try {
      let saved;
      if (formMode === "edit" && editingId != null) {
        saved = await updateBooking(editingId, payload);
        setBookings((prev) => prev.map((b) => (b.id === saved.id ? saved : b)));
        setFeedback({ type: "success", message: "Prenotazione aggiornata." });
      } else {
        saved = await createBooking(payload);
        setBookings((prev) => [...prev, saved]);
        setFeedback({ type: "success", message: "Prenotazione creata." });
      }
      resetForm();
      setIsModalOpen(false);
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
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
      setFeedback({ type: "success", message: "Prenotazione eliminata." });
    } catch (err) {
      setFeedback({
        type: "error",
        message: "Errore eliminando la prenotazione: " + err.message,
      });
    }
  }

  // ---- styles ----

  const container = {
    display: "grid",
    gridTemplateColumns: "1fr",
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
    padding: "8px 4px",
    borderBottom: "1px solid #f3f4f6",
    verticalAlign: "top",
  };

  const pillPaid = (paid) => ({
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 10px",
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

  const chip = (bg, color) => ({
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 10px",
    borderRadius: 999,
    fontSize: 11,
    backgroundColor: bg,
    color,
    border: "1px solid rgba(148,163,184,0.5)",
  });

  const conflictBox = {
    marginTop: 6,
    padding: "8px 10px",
    borderRadius: 10,
    background: "#fef2f2",
    border: "1px solid #fecaca",
    fontSize: 12,
    color: "#b91c1c",
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
  };

  const conflictIcon = {
    width: 20,
    height: 20,
    borderRadius: "999px",
    background: "#b91c1c",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
    marginTop: 1,
  };

  const filtersRow = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
    fontSize: 12,
    flexWrap: "wrap",
  };

  const pillSource = (src) => {
    if (src === "airbnb") {
      return chip("#fee2e2", "#b91c1c");
    }
    if (src === "booking") {
      return chip("#e0f2fe", "#0369a1");
    }
    if (src === "direct") {
      return chip("#dcfce7", "#166534");
    }
    return chip("#f3f4f6", "#4b5563");
  };

  // --- checkbox styles nuovi ---
  const checkboxRow = {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    backgroundColor: "#f9fafb",
  };

  const checkboxInput = {
    width: 16,
    height: 16,
    accentColor: "#0f766e",
    cursor: "pointer",
    marginTop: 2,
    flexShrink: 0,
  };

  const checkboxLabelMain = {
    fontSize: 12,
    fontWeight: 600,
    color: "#111827",
  };

  const checkboxLabelSub = {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 2,
    lineHeight: 1.4,
  };

  return (
    <div>
      <div style={header}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Prenotazioni</h1>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Gestisci le prenotazioni con informazioni economiche complete e
            controlli immediati di disponibilità.
          </p>
        </div>
      </div>

      {error && (
        <p style={{ color: "red", fontSize: 12, marginBottom: 8 }}>{error}</p>
      )}
      <FeedbackMessage
        message={feedback.message}
        type={feedback.type}
        onClose={() => setFeedback({ type: "info", message: "" })}
      />

      {isModalOpen && (
        <div
          onClick={() => setIsModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            zIndex: 1100,
          }}
        />
      )}

      {loading ? (
        <p>Caricamento prenotazioni...</p>
      ) : (
        <div style={container}>
          {/* FORM */}
          <div
            style={{
              ...card,
              display: isModalOpen ? "block" : "none",
              position: "fixed",
              zIndex: 1200,
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(860px, calc(100vw - 24px))",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
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

              {/* disponibilità e conflitti */}
              {parsedCheckin && parsedCheckout && (
                <div style={{ fontSize: 12, marginBottom: 10 }}>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ color: "#16a34a", fontWeight: 600 }}>
                      Libere:
                    </span>{" "}
                    {availability.freeUnits.length === 0 ? (
                      <span style={{ color: "#6b7280" }}>nessuna</span>
                    ) : (
                      availability.freeUnits.map((u) => (
                        <span
                          key={u.id}
                          style={{
                            ...chip("#ecfdf5", "#166534"),
                            marginRight: 4,
                          }}
                        >
                          {u.name}
                        </span>
                      ))
                    )}
                  </div>
                  {availability.occupiedUnits.length > 0 && (
                    <div>
                      <span style={{ color: "#b91c1c", fontWeight: 600 }}>
                        Occupate:
                      </span>{" "}
                      {availability.occupiedUnits.map((u) => (
                        <span
                          key={u.id}
                          style={{
                            ...chip("#fee2e2", "#b91c1c"),
                            marginRight: 4,
                          }}
                        >
                          {u.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {availability.conflictForSelectedUnit && (
                    <div style={conflictBox}>
                      <div style={conflictIcon}>!</div>
                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            marginBottom: 2,
                          }}
                        >
                          Attenzione: questa unità è già occupata nelle date
                          selezionate.
                        </div>
                        {availability.conflictBookings.length > 0 && (
                          <ul
                            style={{
                              margin: 0,
                              paddingLeft: 16,
                              listStyle: "disc",
                            }}
                          >
                            {availability.conflictBookings.map((b) => (
                              <li key={b.id}>
                                {b.guest_name || "Ospite"} ·{" "}
                                {parseDate(
                                  b.checkin_date
                                )?.toLocaleDateString("it-IT")}{" "}
                                →{" "}
                                {parseDate(
                                  b.checkout_date
                                )?.toLocaleDateString("it-IT")}
                              </li>
                            ))}
                          </ul>
                        )}
                        <div style={{ marginTop: 4, color: "#7f1d1d" }}>
                          Puoi cambiare unità oppure modificare il periodo.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SEZIONE OSPITE RINNOVATA */}
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 12, marginBottom: 6 }}>
                Dati Ospite
              </div>

              <div style={field}>
                <label style={label}>Nome e Cognome</label>
                <input
                  style={input}
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Es. Mario Rossi"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={field}>
                  <label style={label}>Email</label>
                  <input
                    style={input}
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>
                <div style={field}>
                  <label style={label}>Telefono / WhatsApp</label>
                  <input
                    style={input}
                    type="tel"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    placeholder="+39 333..."
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <div style={field}>
                  <label style={label}>Adulti</label>
                  <input
                    style={input}
                    type="number"
                    min="1"
                    value={numAdults}
                    onChange={(e) => setNumAdults(e.target.value)}
                  />
                </div>
                <div style={field}>
                  <label style={label}>Bambini</label>
                  <input
                    style={input}
                    type="number"
                    min="0"
                    value={numChildren}
                    onChange={(e) => setNumChildren(e.target.value)}
                  />
                </div>
                <div style={field}>
                  <label style={label}>Ora Arrivo</label>
                  <input
                    style={input}
                    type="time"
                    value={arrivalTime}
                    onChange={(e) => setArrivalTime(e.target.value)}
                  />
                </div>
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
                <div
                  style={{
                    fontSize: 11,
                    color: "#6b7280",
                    marginBottom: 8,
                  }}
                >
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
                  (notti × tariffa + extra). Puoi lasciare vuoto il campo totale
                  per usare questo valore calcolato automaticamente.
                </div>
              )}

              {/* flag pagata + late checkout */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <div style={checkboxRow}>
                  <input
                    id="isPaid"
                    type="checkbox"
                    checked={isPaid}
                    onChange={(e) => setIsPaid(e.target.checked)}
                    style={checkboxInput}
                  />
                  <div>
                    <label htmlFor="isPaid" style={checkboxLabelMain}>
                      Pagata
                    </label>
                    <div style={checkboxLabelSub}>
                      Segna la prenotazione come già incassata.
                    </div>
                  </div>
                </div>

                <div style={checkboxRow}>
                  <input
                    id="hasLateCheckout"
                    type="checkbox"
                    checked={hasLateCheckout}
                    onChange={(e) => setHasLateCheckout(e.target.checked)}
                    style={checkboxInput}
                  />
                  <div>
                    <label htmlFor="hasLateCheckout" style={checkboxLabelMain}>
                      Late check-out
                    </label>
                    <div style={checkboxLabelSub}>
                      Uscita nel pomeriggio; il sistema adegua automaticamente
                      costi e pulizie.
                    </div>
                  </div>
                </div>
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
                <button type="submit" style={buttonPrimary} disabled={saving}>
                  {saving
                    ? "Salvataggio..."
                    : formMode === "create"
                    ? "Crea prenotazione"
                    : "Salva modifiche"}
                </button>
                <button
                  type="button"
                  style={buttonSecondary}
                  onClick={() => {
                    resetForm();
                    setIsModalOpen(false);
                  }}
                >
                  Annulla
                </button>
              </div>
            </form>
          </div>

          {/* LISTA PRENOTAZIONI */}
          <div style={card}>
            <div style={filtersRow}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                Elenco prenotazioni
                <div
                  style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}
                >
                  Mostrate: {shownCount} / {totalCount}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  style={{ ...buttonPrimary, padding: "6px 12px", fontSize: 12 }}
                  onClick={openCreateModal}
                >
                  + Nuova prenotazione
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 11, color: "#6b7280" }}>Unità</span>
                  <select
                    style={{
                      ...input,
                      padding: "4px 8px",
                      fontSize: 12,
                      width: 120,
                    }}
                    value={unitFilter}
                    onChange={(e) => setUnitFilter(e.target.value)}
                  >
                    <option value="all">Tutte</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 11, color: "#6b7280" }}>
                    Pagamento
                  </span>
                  <select
                    style={{
                      ...input,
                      padding: "4px 8px",
                      fontSize: 12,
                      width: 140,
                    }}
                    value={paymentFilter}
                    onChange={(e) => setPaymentFilter(e.target.value)}
                  >
                    <option value="all">Tutte</option>
                    <option value="unpaid">Da incassare</option>
                    <option value="paid">Pagate</option>
                  </select>
                </div>
              </div>
            </div>

            {filteredBookings.length === 0 ? (
              <p style={{ fontSize: 13, color: "#6b7280" }}>
                Nessuna prenotazione per i filtri selezionati.
              </p>
            ) : (
              <div style={{ overflowX: "auto", marginTop: 4 }}>
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Ospite / Canale</th>
                      <th style={th}>Periodo</th>
                      <th style={th}>Unità</th>
                      <th style={th}>Totale</th>
                      <th style={th}>Stato</th>
                      <th style={th}>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBookings.map((b) => {
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
                          <td style={td}>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 2,
                              }}
                            >
                              <span style={{ fontWeight: 500 }}>
                                {b.guest_name}
                              </span>
                              <span>
                                <span style={pillSource(b.source)}>
                                  {b.source === "direct"
                                    ? "Diretta"
                                    : b.source === "airbnb"
                                    ? "Airbnb"
                                    : b.source === "booking"
                                    ? "Booking.com"
                                    : b.source || "Altro"}
                                </span>
                              </span>
                            </div>
                          </td>
                          <td style={td}>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 2,
                              }}
                            >
                              <span>
                                {cIn?.toLocaleDateString("it-IT")} →{" "}
                                {cOut?.toLocaleDateString("it-IT")}
                              </span>
                              <span
                                style={{
                                  fontSize: 11,
                                  color: "#6b7280",
                                }}
                              >
                                {n} notte{n !== 1 ? "i" : ""}
                              </span>
                              {b.has_late_checkout && (
                                <span
                                  style={{
                                    ...chip("#fef9c3", "#92400e"),
                                    marginTop: 2,
                                  }}
                                >
                                  Late check-out
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={td}>{unit?.name || `Unit #${b.unit_id}`}</td>
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
                              onClick={() => {
                                loadBookingIntoForm(b);
                                setIsModalOpen(true);
                              }}
                            >
                              Modifica
                            </button>{" "}
                            <button
                              type="button"
                              style={{
                                ...buttonSecondary,
                                padding: "4px 10px",
                                fontSize: 12,
                                borderColor: "#6366f1",
                                color: "#4338ca",
                                marginRight: 4
                              }}
                              onClick={() => openDocument(b)}
                            >
                              Stampa
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
