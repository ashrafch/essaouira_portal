import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { canEditOperations } from "../config/rbac";
import {
  getBookings,
  getUnits,
  createBooking,
  updateBooking,
  deleteBooking,
} from "../services/api";
import { PageHeader, Button, Modal, useToast } from "../components/ui";
import { Plus, Pencil, Printer, Trash2 } from "lucide-react";
import { formatISO, nightsBetween } from "../utils/dateUtils";
import { formatCurrency } from "../utils/format";
import { bookingConflicts, filterBookings, BOOKING_STATUS_LABELS } from "../utils/bookingViews";
import { readWorkflowContext } from "../routes/workflowContext";
import "./bookings.css";

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function Bookings() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const viewFilter = ["arrivals", "departures", "in-house", "cancelled"].includes(params.get("view")) ? params.get("view") : "all";
  const filterDate = readWorkflowContext(location).date || formatISO(new Date());
  const [search, setSearch] = useState("");
  const handledIntent = useRef(null);
  const canEdit = canEditOperations();
  const toast = useToast();

  const [units, setUnits] = useState([]);
  const [bookings, setBookings] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
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
    const context = readWorkflowContext(location);
    const queryIntent = context.bookingId ? { editBookingId: context.bookingId }
      : params.get("new_booking") === "1" && context.date ? { newBookingDate: context.date, unitId: context.unitId } : null;
    const state = location.state || queryIntent;
    if (!state) { handledIntent.current = null; return; }
    if (loading || error) return;
    const intentKey = state.editBookingId ? `edit:${state.editBookingId}` : `new:${state.newBookingDate || ""}:${state.unitId || ""}`;
    // Saving updates the collection before a router transition can remove the
    // query. Do not reopen or overwrite the form for an already handled intent.
    if (handledIntent.current === intentKey) return;
    handledIntent.current = intentKey;
    if (state.unitId) setUnitFilter(String(state.unitId));

    if (state.newBookingDate && canEdit) {
      const d = state.newBookingDate;
      resetForm();
      setFormMode("create");
      setEditingId(null);
      setCheckinDate(d);
      const checkout = new Date(d + "T12:00:00");
      checkout.setDate(checkout.getDate() + 1);
      setCheckoutDate(formatISO(checkout));
      if (state.unitId) setUnitId(String(state.unitId));
      setIsModalOpen(true);
    }

    if (state.editBookingId) {
      const b = bookings.find((bk) => String(bk.id) === String(state.editBookingId));
      if (b) {
        loadBookingIntoForm(b);
        setIsModalOpen(true);
      } else {
        toast.error("Prenotazione non disponibile.");
      }
    }
    if (location.state) {
      // Persist the intent before consuming transient router state. Route exit
      // animations may mount the destination again during navigation.
      const next = new URLSearchParams(location.search);
      if (state.editBookingId) next.set("booking_id", state.editBookingId);
      if (state.newBookingDate) { next.set("new_booking", "1"); next.set("date", state.newBookingDate); }
      if (state.unitId) next.set("unit_id", state.unitId);
      navigate(`${location.pathname}?${next}`, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, location.search, bookings, loading, error, canEdit]);

  function closeBookingModal() {
    resetForm();
    setIsModalOpen(false);
    setParams(previous => {
      const next = new URLSearchParams(previous);
      next.delete("booking_id");
      next.delete("new_booking");
      return next;
    }, { replace: true });
  }

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
  const nights =
    parsedCheckin && parsedCheckout
      ? nightsBetween(parsedCheckin, parsedCheckout)
      : 0;

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
        b.unit_id === u.id && bookingConflicts(b, checkinDate, checkoutDate, editingId)
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
  }, [bookings, units, parsedCheckin, parsedCheckout, checkinDate, checkoutDate, unitId, editingId]);

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
    return filterBookings(bookings, { unit: unitFilter, payment: paymentFilter, view: viewFilter, query: search, today: filterDate }, unitMap);
  }, [bookings, unitFilter, paymentFilter, viewFilter, search, filterDate, unitMap]);

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
    if (!canEdit) return;
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
    setCheckinDate(b.checkin_date ? formatISO(new Date(b.checkin_date)) : "");
    setCheckoutDate(
      b.checkout_date ? formatISO(new Date(b.checkout_date)) : ""
    );
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
    if (!canEdit || saving) return;
    if (nights <= 0) {
      toast.error("Il check-out deve essere successivo al check-in.");
      return;
    }
    if (!unitId || !guestName || !checkinDate || !checkoutDate) {
      toast.error("Unità, ospite, check-in e check-out sono obbligatori.");
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
        toast.success("Prenotazione aggiornata.");
      } else {
        saved = await createBooking(payload);
        setBookings((prev) => [...prev, saved]);
        toast.success("Prenotazione creata.");
      }
      closeBookingModal();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!canEdit) return;
    if (!window.confirm("Sei sicuro di voler eliminare questa prenotazione?"))
      return;
    try {
      await deleteBooking(id);
      setBookings((prev) => prev.filter((b) => b.id !== id));
      if (editingId === id) {
        resetForm();
      }
      toast.success("Prenotazione eliminata.");
    } catch (err) {
      toast.error("Errore eliminando la prenotazione: " + err.message);
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
    backgroundColor: "var(--color-surface)",
    borderRadius: "14px",
    padding: "16px 18px",
    boxShadow: "var(--shadow-sm)",
    border: "1px solid var(--color-border)",
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
    color: "var(--color-text-muted)",
  };

  const input = {
    borderRadius: 8,
    border: "1px solid var(--color-border-strong)",
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
    fontSize: 12,
  };

  const td = {
    padding: "8px 4px",
    borderBottom: "1px solid var(--color-border)",
    verticalAlign: "top",
  };

  const pillPaid = (paid) => ({
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 500,
    backgroundColor: paid ? "var(--color-success-soft)" : "var(--color-danger-soft)",
    color: paid ? "var(--color-success-strong)" : "var(--color-danger-strong)",
    border: `1px solid ${paid ? "var(--color-success)" : "var(--color-danger)"}`,
  });

  const chip = (bg, color) => ({
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 10px",
    borderRadius: 999,
    fontSize: 11,
    backgroundColor: bg,
    color,
    border: "1px solid var(--color-border-strong)",
  });

  const conflictBox = {
    marginTop: 6,
    padding: "8px 10px",
    borderRadius: 10,
    background: "var(--color-danger-soft)",
    border: "1px solid var(--color-danger)",
    fontSize: 12,
    color: "var(--color-danger-strong)",
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
  };

  const conflictIcon = {
    width: 20,
    height: 20,
    borderRadius: "999px",
    background: "var(--color-danger)",
    color: "var(--color-on-primary)",
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
      return chip("var(--color-danger-soft)", "var(--color-danger-strong)");
    }
    if (src === "booking") {
      return chip("var(--color-info-soft)", "var(--color-info-strong)");
    }
    if (src === "direct") {
      return chip("var(--color-success-soft)", "var(--color-success-strong)");
    }
    return chip("var(--color-surface-soft)", "var(--color-text-muted)");
  };

  // --- checkbox styles nuovi ---
  const checkboxRow = {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid var(--color-border-strong)",
    backgroundColor: "var(--color-surface-soft)",
  };

  const checkboxInput = {
    width: 16,
    height: 16,
    accentColor: "var(--color-primary)",
    cursor: "pointer",
    marginTop: 2,
    flexShrink: 0,
  };

  const checkboxLabelMain = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--color-text)",
  };

  const checkboxLabelSub = {
    fontSize: 11,
    color: "var(--color-text-muted)",
    marginTop: 2,
    lineHeight: 1.4,
  };

  return (
    <div>
      <PageHeader
        title="Prenotazioni"
        subtitle="Gestisci le prenotazioni con informazioni economiche complete e controlli immediati di disponibilità."
      />

      {error && (
        <p style={{ color: "var(--color-danger)", fontSize: 12, marginBottom: 8 }}>{error}</p>
      )}

      {loading ? (
        <p>Caricamento prenotazioni...</p>
      ) : (
        <>
          <Modal
            open={isModalOpen}
            onClose={closeBookingModal}
            title={
              formMode === "create"
                ? "Nuova prenotazione"
                : `${canEdit ? "Modifica" : "Dettaglio"} prenotazione #${editingId}`
            }
            size="lg"
            footer={
              <>
                <Button
                  variant="secondary"
                  onClick={closeBookingModal}
                >
                  Annulla
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  form="booking-form"
                  disabled={saving || !canEdit}
                >
                  {saving
                    ? "Salvataggio..."
                    : formMode === "create"
                    ? "Crea prenotazione"
                    : "Salva modifiche"}
                </Button>
              </>
            }
          >
            <form id="booking-form" onSubmit={handleSubmit}>
              <fieldset disabled={!canEdit || saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              {/* DATI BASE */}
              <div style={field}>
                <label style={label} htmlFor="booking-unitId">Appartamento</label>
                <select
                  style={select}
                  id="booking-unitId"
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
                    <span style={{ color: "var(--color-success)", fontWeight: 600 }}>
                      Libere:
                    </span>{" "}
                    {availability.freeUnits.length === 0 ? (
                      <span style={{ color: "var(--color-text-muted)" }}>nessuna</span>
                    ) : (
                      availability.freeUnits.map((u) => (
                        <span
                          key={u.id}
                          style={{
                            ...chip("var(--color-success-soft)", "var(--color-success-strong)"),
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
                      <span style={{ color: "var(--color-danger-strong)", fontWeight: 600 }}>
                        Occupate:
                      </span>{" "}
                      {availability.occupiedUnits.map((u) => (
                        <span
                          key={u.id}
                          style={{
                            ...chip("var(--color-danger-soft)", "var(--color-danger-strong)"),
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
                        <div style={{ marginTop: 4, color: "var(--color-danger-strong)" }}>
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
                <label style={label} htmlFor="booking-guestName">Nome e Cognome</label>
                <input
                  style={input}
                  id="booking-guestName"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Es. Mario Rossi"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={field}>
                  <label style={label} htmlFor="booking-guestEmail">Email</label>
                  <input
                    style={input}
                    type="email"
                    id="booking-guestEmail"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>
                <div style={field}>
                  <label style={label} htmlFor="booking-guestPhone">Telefono / WhatsApp</label>
                  <input
                    style={input}
                    type="tel"
                    id="booking-guestPhone"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    placeholder="+39 333..."
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <div style={field}>
                  <label style={label} htmlFor="booking-numAdults">Adulti</label>
                  <input
                    style={input}
                    type="number"
                    min="1"
                    id="booking-numAdults"
                    value={numAdults}
                    onChange={(e) => setNumAdults(e.target.value)}
                  />
                </div>
                <div style={field}>
                  <label style={label} htmlFor="booking-numChildren">Bambini</label>
                  <input
                    style={input}
                    type="number"
                    min="0"
                    id="booking-numChildren"
                    value={numChildren}
                    onChange={(e) => setNumChildren(e.target.value)}
                  />
                </div>
                <div style={field}>
                  <label style={label} htmlFor="booking-arrivalTime">Ora Arrivo</label>
                  <input
                    style={input}
                    type="time"
                    id="booking-arrivalTime"
                    value={arrivalTime}
                    onChange={(e) => setArrivalTime(e.target.value)}
                  />
                </div>
              </div>

              <div style={field}>
                <label style={label} htmlFor="booking-source">Canale</label>
                <select
                  style={select}
                  id="booking-source"
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
                  <label style={label} htmlFor="booking-checkinDate">Check-in</label>
                  <input
                    style={input}
                    type="date"
                    id="booking-checkinDate"
                    value={checkinDate}
                    onChange={(e) => setCheckinDate(e.target.value)}
                  />
                </div>
                <div style={field}>
                  <label style={label} htmlFor="booking-checkoutDate">Check-out</label>
                  <input
                    style={input}
                    type="date"
                    id="booking-checkoutDate"
                    value={checkoutDate}
                    onChange={(e) => setCheckoutDate(e.target.value)}
                  />
                </div>
              </div>

              {nights > 0 && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--color-text-muted)",
                    marginBottom: 8,
                  }}
                >
                  Notti: <strong>{nights}</strong>
                </div>
              )}

              {/* SEZIONE ECONOMICA */}
              <hr style={{ margin: "10px 0 8px", borderColor: "var(--color-border)" }} />
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
                  <label style={label} htmlFor="booking-nightlyRate">Tariffa per notte</label>
                  <input
                    style={input}
                    type="number"
                    min="0"
                    step="0.01"
                    id="booking-nightlyRate"
                    value={nightlyRate}
                    onChange={(e) => setNightlyRate(e.target.value)}
                    placeholder="es. 80"
                  />
                </div>
                <div style={field}>
                  <label style={label} htmlFor="booking-totalPrice">Totale prenotazione</label>
                  <input
                    style={input}
                    type="number"
                    min="0"
                    step="0.01"
                    id="booking-totalPrice"
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
                  <label style={label} htmlFor="booking-cleaningFee">Cleaning fee</label>
                  <input
                    style={input}
                    type="number"
                    min="0"
                    step="0.01"
                    id="booking-cleaningFee"
                    value={cleaningFee}
                    onChange={(e) => setCleaningFee(e.target.value)}
                    placeholder="es. 20"
                  />
                </div>
                <div style={field}>
                  <label style={label} htmlFor="booking-cityTax">Tassa di soggiorno</label>
                  <input
                    style={input}
                    type="number"
                    min="0"
                    step="0.01"
                    id="booking-cityTax"
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
                  <label style={label} htmlFor="booking-channelFee">Commissioni canale</label>
                  <input
                    style={input}
                    type="number"
                    min="0"
                    step="0.01"
                    id="booking-channelFee"
                    value={channelFee}
                    onChange={(e) => setChannelFee(e.target.value)}
                    placeholder="es. 15"
                  />
                </div>
                <div style={field}>
                  <label style={label} htmlFor="booking-currency">Valuta</label>
                  <select
                    style={select}
                    id="booking-currency"
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
                    color: "var(--color-text-muted)",
                    marginBottom: 8,
                  }}
                >
                  Totale stimato:{" "}
                  <strong>
                    {formatCurrency(suggestedTotal, currency, { decimals: 2 })}
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
                <label style={label} htmlFor="booking-notes">Note interne</label>
                <textarea
                  style={textarea}
                  id="booking-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Note per te / staff (non visibili all'ospite)"
                />
              </div>

              </fieldset>
            </form>
          </Modal>

          <div style={container}>
          {/* LISTA PRENOTAZIONI */}
          <div style={card}>
            <div style={filtersRow}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                Elenco prenotazioni
                <div
                  style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}
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
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Plus size={16} />}
                  onClick={openCreateModal}
                  disabled={!canEdit}
                >
                  Nuova prenotazione
                </Button>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Unità</span>
                  <select
                    style={{
                      ...input,
                      padding: "4px 8px",
                      fontSize: 12,
                      width: 120,
                    }}
                    value={unitFilter}
                    aria-label="Filtra per unita"
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
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
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
                    aria-label="Filtra per pagamento"
                    onChange={(e) => setPaymentFilter(e.target.value)}
                  >
                    <option value="all">Tutte</option>
                    <option value="unpaid">Da incassare</option>
                    <option value="paid">Pagate</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="booking-filters">
              <input type="search" aria-label="Cerca prenotazioni" placeholder="Ospite, email, telefono o unita" value={search} onChange={event => setSearch(event.target.value)} />
              <select aria-label="Vista prenotazioni" value={viewFilter} onChange={event => setParams(previous => {
                const next = new URLSearchParams(previous);
                if (event.target.value === "all") { next.delete("view"); next.delete("date"); }
                else next.set("view", event.target.value);
                return next;
              })}>
                <option value="all">Tutte le prenotazioni</option>
                <option value="arrivals">Arrivi</option>
                <option value="departures">Partenze</option>
                <option value="in-house">In casa</option>
                <option value="cancelled">Cancellate</option>
              </select>
              {["arrivals", "departures", "in-house"].includes(viewFilter) && <input aria-label="Data operativa" type="date" value={filterDate} onChange={event => {
                const date = event.target.value;
                if (date) setParams(previous => { const next = new URLSearchParams(previous); next.set("date", date); return next; }, { replace: true });
              }} />}
              {(search || unitFilter !== "all" || paymentFilter !== "all" || viewFilter !== "all") && <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setUnitFilter("all"); setPaymentFilter("all"); setParams({}); }}>Azzera filtri</Button>}
            </div>

            {filteredBookings.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                Nessuna prenotazione per i filtri selezionati.
              </p>
            ) : (
              <div style={{ overflowX: "auto", marginTop: 4 }}>
                <table className="ui-table-cards" style={table}>
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
                      const n = cIn && cOut ? nightsBetween(cIn, cOut) : 0;
                      const total =
                        b.total_price != null
                          ? Number(b.total_price)
                          : b.nightly_rate != null
                          ? Number(b.nightly_rate) * n
                          : null;

                      return (
                        <tr key={b.id}>
                          <td style={td} data-label="Ospite / Canale">
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
                          <td style={td} data-label="Periodo">
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
                                  color: "var(--color-text-muted)",
                                }}
                              >
                                {n} {n === 1 ? "notte" : "notti"}
                              </span>
                              {b.has_late_checkout && (
                                <span
                                  style={{
                                    ...chip("var(--color-warning-soft)", "var(--color-warning-strong)"),
                                    marginTop: 2,
                                  }}
                                >
                                  Late check-out
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={td} data-label="Unità">
                            {unit?.name || `Unit #${b.unit_id}`}
                          </td>
                          <td style={td} data-label="Totale">
                            {total != null
                              ? formatCurrency(total, b.currency || "EUR", {
                                  decimals: 2,
                                })
                              : "—"}
                          </td>
                          <td style={td} data-label="Stato">
                            <div style={{ fontSize: 12, marginBottom: 4, color: b.status === "cancelled" ? "var(--color-danger-strong)" : "var(--color-text-muted)" }}>{BOOKING_STATUS_LABELS[b.status] || b.status}</div>
                            {b.status !== "cancelled" && <span style={pillPaid(b.is_paid)}>
                              {b.is_paid ? "Pagata" : "Da incassare"}
                            </span>}
                          </td>
                          <td
                            style={{ ...td, whiteSpace: "nowrap" }}
                            data-label="Azioni"
                          >
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <Button
                                variant="secondary"
                                size="sm"
                                icon={<Pencil size={16} />}
                                onClick={() => {
                                  loadBookingIntoForm(b);
                                  setIsModalOpen(true);
                                }}
                              >
                                {canEdit ? "Modifica" : "Dettagli"}
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                icon={<Printer size={16} />}
                                onClick={() => openDocument(b)}
                              >
                                Stampa
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                icon={<Trash2 size={16} />}
                                onClick={() => handleDelete(b.id)}
                                disabled={!canEdit}
                              >
                                Elimina
                              </Button>
                            </div>
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
        </>
      )}
    </div>
  );
}

export default Bookings;
