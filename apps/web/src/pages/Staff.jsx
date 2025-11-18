import { useEffect, useMemo, useState } from "react";
import {
  getStaffTasks,
  createStaffTask,
  updateStaffTask,
  deleteStaffTask,
  getUnits,
  getStaffDefaults,
  updateStaffDefaults,
} from "../services/api";

function Staff() {
  const [tasks, setTasks] = useState([]);
  const [units, setUnits] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [formMode, setFormMode] = useState("create"); // "create" | "edit"
  const [editingId, setEditingId] = useState(null);

  // filtri
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // form task singolo
  const [date, setDate] = useState("");
  const [taskType, setTaskType] = useState("cleaning");
  const [assigneeName, setAssigneeName] = useState("");
  const [unitId, setUnitId] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [status, setStatus] = useState("planned");
  const [cost, setCost] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [notes, setNotes] = useState("");

  // impostazioni default per task automatiche
  const [defaultsLoading, setDefaultsLoading] = useState(true);
  const [defaultsSaving, setDefaultsSaving] = useState(false);
  const [defaultsMessage, setDefaultsMessage] = useState("");
  const [defAssignee, setDefAssignee] = useState("Operatore 1");
  const [defCost, setDefCost] = useState("5");
  const [defHours, setDefHours] = useState("1");
  const [defCurrency, setDefCurrency] = useState("EUR");

  // caricamento iniziale: unità + task + defaults
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [uns, tsks, defs] = await Promise.all([
          getUnits(),
          getStaffTasks({}),
          getStaffDefaults(),
        ]);
        setUnits(uns);
        setTasks(tsks);

        if (defs) {
          setDefAssignee(defs.cleaning_default_assignee || "Operatore 1");
          setDefCost(
            defs.cleaning_default_cost != null
              ? String(defs.cleaning_default_cost)
              : "5"
          );
          setDefHours(
            defs.cleaning_default_hours != null
              ? String(defs.cleaning_default_hours)
              : "1"
          );
          setDefCurrency(defs.currency || "EUR");
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
        setDefaultsLoading(false);
      }
    }
    load();
  }, []);

  // ricarica task quando cambi i filtri data (dal server)
  useEffect(() => {
    async function reloadWithDateFilter() {
      const params = {};
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      try {
        const tsks = await getStaffTasks(params);
        setTasks(tsks);
      } catch (err) {
        console.error("Errore caricando task staff:", err);
      }
    }
    reloadWithDateFilter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  const unitMap = useMemo(
    () =>
      units.reduce((acc, u) => {
        acc[u.id] = u;
        return acc;
      }, {}),
    [units]
  );

  // filtri lato client su assignee / stato
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (
        assigneeFilter &&
        !(t.assignee_name || "")
          .toLowerCase()
          .includes(assigneeFilter.toLowerCase())
      ) {
        return false;
      }
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      return true;
    });
  }, [tasks, assigneeFilter, statusFilter]);

  // KPI
  const kpi = useMemo(() => {
    const total = filteredTasks.length;
    const byStatus = filteredTasks.reduce(
      (acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
      },
      /** @type {Record<string, number>} */ ({})
    );
    const hours = filteredTasks.reduce(
      (sum, t) => sum + (t.estimated_hours || 0),
      0
    );
    const costTotal = filteredTasks.reduce(
      (sum, t) => sum + (t.cost || 0),
      0
    );
    return { total, byStatus, hours, costTotal };
  }, [filteredTasks]);

  function resetForm() {
    setFormMode("create");
    setEditingId(null);
    setDate("");
    setTaskType("cleaning");
    setAssigneeName("");
    setUnitId("");
    setBookingId("");
    setEstimatedHours("");
    setStatus("planned");
    setCost("");
    setCurrency("EUR");
    setNotes("");
  }

  function loadTaskIntoForm(t) {
    setFormMode("edit");
    setEditingId(t.id);
    setDate(t.date || "");
    setTaskType(t.task_type || "cleaning");
    setAssigneeName(t.assignee_name || "");
    setUnitId(t.unit_id ? String(t.unit_id) : "");
    setBookingId(t.booking_id ? String(t.booking_id) : "");
    setEstimatedHours(
      t.estimated_hours != null ? String(t.estimated_hours) : ""
    );
    setStatus(t.status || "planned");
    setCost(t.cost != null ? String(t.cost) : "");
    setCurrency(t.currency || "EUR");
    setNotes(t.notes || "");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!date || !taskType) {
      alert("La data e il tipo di task sono obbligatori.");
      return;
    }

    const payload = {
      date,
      task_type: taskType,
      assignee_name: assigneeName || null,
      estimated_hours: estimatedHours !== "" ? Number(estimatedHours) : null,
      status,
      notes: notes || null,
      cost: cost !== "" ? Number(cost) : null,
      currency,
      booking_id: bookingId !== "" ? Number(bookingId) : null,
      unit_id: unitId !== "" ? Number(unitId) : null,
      time: null, // per ora ignoriamo orario, lo si può gestire in futuro
    };

    setSaving(true);
    setError(null);
    try {
      let saved;
      if (formMode === "edit" && editingId != null) {
        saved = await updateStaffTask(editingId, payload);
        setTasks((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
      } else {
        saved = await createStaffTask(payload);
        setTasks((prev) => [...prev, saved]);
      }
      resetForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Eliminare questo task staff?")) return;
    try {
      await deleteStaffTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (editingId === id) resetForm();
    } catch (err) {
      alert("Errore eliminando il task: " + err.message);
    }
  }

  async function handleSaveDefaults(e) {
    e.preventDefault();
    setDefaultsSaving(true);
    setDefaultsMessage("");
    try {
      const payload = {
        cleaning_default_assignee: defAssignee,
        cleaning_default_cost: Number(defCost || 0),
        cleaning_default_hours: Number(defHours || 0),
        currency: defCurrency || "EUR",
      };
      await updateStaffDefaults(payload);
      setDefaultsMessage(
        "Impostazioni salvate. Le nuove prenotazioni useranno questi valori."
      );
    } catch (err) {
      console.error(err);
      setDefaultsMessage("Errore nel salvataggio delle impostazioni.");
    } finally {
      setDefaultsSaving(false);
    }
  }

  // --- styles ---

  const header = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 16,
    gap: 12,
    flexWrap: "wrap",
  };

  const card = {
    backgroundColor: "white",
    borderRadius: "14px",
    padding: "16px 18px",
    boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
    border: "1px solid #e5e7eb",
  };

  const container = {
    display: "grid",
    gridTemplateColumns: "minmax(260px, 320px) 1fr",
    gap: 16,
    alignItems: "flex-start",
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

  const select = {
    ...input,
  };

  const textarea = {
    ...input,
    minHeight: 60,
    resize: "vertical",
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

  const kpiGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 10,
    marginBottom: 12,
  };

  const kpiCard = {
    background: "#f9fafb",
    borderRadius: "12px",
    padding: "10px 12px",
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

  const pillStatus = (st) => {
    let bg = "#e5e7eb";
    let color = "#374151";
    if (st === "planned") {
      bg = "#dbeafe";
      color = "#1d4ed8";
    } else if (st === "in_progress") {
      bg = "#fef9c3";
      color = "#b45309";
    } else if (st === "done") {
      bg = "#dcfce7";
      color = "#166534";
    } else if (st === "cancelled") {
      bg = "#fee2e2";
      color = "#b91c1c";
    }
    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "2px 8px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 500,
      backgroundColor: bg,
      color,
      border: "1px solid rgba(148,163,184,0.5)",
    };
  };

  return (
    <div>
      <div style={header}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Staff & Operatività</h1>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Pianifica pulizie, check-in e manutenzioni con una vista chiara per
            lo staff.
          </p>
        </div>

        <div style={{ fontSize: 12, color: "#6b7280" }}>
          <div style={{ marginBottom: 4 }}>Filtra per data</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="date"
              style={{ ...input, width: "auto" }}
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
            <input
              type="date"
              style={{ ...input, width: "auto" }}
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {error && (
        <p style={{ color: "red", fontSize: 12, marginBottom: 8 }}>{error}</p>
      )}

      {loading ? (
        <p>Caricamento task staff...</p>
      ) : (
        <>
          {/* KPI */}
          <div style={kpiGrid}>
            <div style={kpiCard}>
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                Task totali (filtrati)
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>
                {kpi.total}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>
                Planned: {kpi.byStatus.planned || 0} · In corso:{" "}
                {kpi.byStatus.in_progress || 0} · Completati:{" "}
                {kpi.byStatus.done || 0}
              </div>
            </div>

            <div style={kpiCard}>
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                Ore stimate totali
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>
                {kpi.hours.toFixed(1)}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>
                Utile per stimare il carico di lavoro dello staff
              </div>
            </div>

            <div style={kpiCard}>
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                Costo stimato complessivo
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>
                € {kpi.costTotal.toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>
                Somma dei costi delle task filtrate
              </div>
            </div>
          </div>

          {/* Impostazioni default task automatiche */}
          <div style={{ ...card, marginBottom: 16 }}>
            <h2 style={{ fontSize: 14, marginBottom: 8 }}>
              Impostazioni task automatiche
            </h2>
            <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
              Questi valori vengono usati quando il portale crea automaticamente
              una task (es. pulizia al check-out) quando inserisci una nuova
              prenotazione.
            </p>

            {defaultsLoading ? (
              <p style={{ fontSize: 13, color: "#6b7280" }}>
                Caricamento impostazioni...
              </p>
            ) : (
              <form onSubmit={handleSaveDefaults}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 12,
                  }}
                >
                  <div style={field}>
                    <label style={label}>Operatore di default</label>
                    <input
                      style={input}
                      value={defAssignee}
                      onChange={(e) => setDefAssignee(e.target.value)}
                      placeholder="Es. Operatore 1"
                    />
                  </div>
                  <div style={field}>
                    <label style={label}>Costo base (€) per task</label>
                    <input
                      style={input}
                      type="number"
                      min="0"
                      step="0.5"
                      value={defCost}
                      onChange={(e) => setDefCost(e.target.value)}
                    />
                  </div>
                  <div style={field}>
                    <label style={label}>Ore stimate per task</label>
                    <input
                      style={input}
                      type="number"
                      min="0"
                      step="0.25"
                      value={defHours}
                      onChange={(e) => setDefHours(e.target.value)}
                    />
                  </div>
                  <div style={field}>
                    <label style={label}>Valuta</label>
                    <input
                      style={input}
                      value={defCurrency}
                      maxLength={3}
                      onChange={(e) => setDefCurrency(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  style={{ ...buttonPrimary, marginTop: 10 }}
                  disabled={defaultsSaving}
                >
                  {defaultsSaving
                    ? "Salvataggio..."
                    : "Salva impostazioni automatiche"}
                </button>
                {defaultsMessage && (
                  <p
                    style={{
                      fontSize: 12,
                      color: "#6b7280",
                      marginTop: 6,
                    }}
                  >
                    {defaultsMessage}
                  </p>
                )}
              </form>
            )}
          </div>

          <div style={container}>
            {/* FORM */}
            <div style={card}>
              <h2 style={{ fontSize: 14, marginBottom: 10 }}>
                {formMode === "create"
                  ? "Nuovo task staff"
                  : `Modifica task #${editingId}`}
              </h2>

              <form onSubmit={handleSubmit}>
                <div style={field}>
                  <label style={label}>Data</label>
                  <input
                    type="date"
                    style={input}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>

                <div style={field}>
                  <label style={label}>Tipo task</label>
                  <select
                    style={select}
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value)}
                  >
                    <option value="cleaning">Pulizie</option>
                    <option value="checkin">Check-in</option>
                    <option value="checkout">Check-out</option>
                    <option value="breakfast">Colazione</option>
                    <option value="maintenance">Manutenzione</option>
                    <option value="other">Altro</option>
                  </select>
                </div>

                <div style={field}>
                  <label style={label}>Assegnato a</label>
                  <input
                    style={input}
                    value={assigneeName}
                    onChange={(e) => setAssigneeName(e.target.value)}
                    placeholder="Nome dello staff"
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                  }}
                >
                  <div style={field}>
                    <label style={label}>Appartamento (opzionale)</label>
                    <select
                      style={select}
                      value={unitId}
                      onChange={(e) => setUnitId(e.target.value)}
                    >
                      <option value="">Nessuno</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={field}>
                    <label style={label}>ID prenotazione (opzionale)</label>
                    <input
                      style={input}
                      type="number"
                      min="1"
                      value={bookingId}
                      onChange={(e) => setBookingId(e.target.value)}
                      placeholder="es. 12"
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
                    <label style={label}>Ore stimate</label>
                    <input
                      style={input}
                      type="number"
                      min="0"
                      step="0.25"
                      value={estimatedHours}
                      onChange={(e) => setEstimatedHours(e.target.value)}
                      placeholder="es. 1.5"
                    />
                  </div>
                  <div style={field}>
                    <label style={label}>Stato</label>
                    <select
                      style={select}
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="planned">Planned</option>
                      <option value="in_progress">In corso</option>
                      <option value="done">Completato</option>
                      <option value="cancelled">Annullato</option>
                    </select>
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
                    <label style={label}>Costo stimato</label>
                    <input
                      style={input}
                      type="number"
                      min="0"
                      step="0.01"
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                      placeholder="es. 20"
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

                <div style={field}>
                  <label style={label}>Note interne</label>
                  <textarea
                    style={textarea}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Note per lo staff (es. orario preferito, richieste speciali...)"
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
                      ? "Crea task"
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

            {/* LISTA TASK */}
            <div style={card}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                  gap: 8,
                }}
              >
                <h2 style={{ fontSize: 14 }}>Agenda staff</h2>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    fontSize: 12,
                  }}
                >
                  <input
                    style={{ ...input, width: 140 }}
                    placeholder="Filtra per nome..."
                    value={assigneeFilter}
                    onChange={(e) => setAssigneeFilter(e.target.value)}
                  />
                  <select
                    style={{ ...select, width: 130 }}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">Tutti gli stati</option>
                    <option value="planned">Planned</option>
                    <option value="in_progress">In corso</option>
                    <option value="done">Completato</option>
                    <option value="cancelled">Annullato</option>
                  </select>
                </div>
              </div>

              {filteredTasks.length === 0 ? (
                <p style={{ fontSize: 13, color: "#6b7280" }}>
                  Nessun task staff per i filtri selezionati.
                </p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={th}>Data</th>
                        <th style={th}>Tipo</th>
                        <th style={th}>Staff</th>
                        <th style={th}>Unità</th>
                        <th style={th}>Ore</th>
                        <th style={th}>Costo</th>
                        <th style={th}>Stato</th>
                        <th style={th}>Azioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTasks
                        .slice()
                        .sort((a, b) => a.date.localeCompare(b.date))
                        .map((t) => {
                          const u = t.unit_id ? unitMap[t.unit_id] : null;
                          return (
                            <tr key={t.id}>
                              <td style={td}>
                                {t.date
                                  ? new Date(t.date).toLocaleDateString("it-IT")
                                  : "—"}
                              </td>
                              <td style={td}>
                                {t.task_type === "cleaning"
                                  ? "Pulizie"
                                  : t.task_type === "checkin"
                                  ? "Check-in"
                                  : t.task_type === "checkout"
                                  ? "Check-out"
                                  : t.task_type === "breakfast"
                                  ? "Colazione"
                                  : t.task_type === "maintenance"
                                  ? "Manutenzione"
                                  : "Altro"}
                              </td>
                              <td style={td}>{t.assignee_name || "—"}</td>
                              <td style={td}>
                                {u
                                  ? u.name
                                  : t.unit_id
                                  ? `Unit #${t.unit_id}`
                                  : "—"}
                              </td>
                              <td style={td}>
                                {t.estimated_hours != null
                                  ? t.estimated_hours.toFixed(1)
                                  : "—"}
                              </td>
                              <td style={td}>
                                {t.cost != null
                                  ? `${t.currency || "EUR"} ${Number(
                                      t.cost
                                    ).toFixed(2)}`
                                  : "—"}
                              </td>
                              <td style={td}>
                                <span style={pillStatus(t.status)}>
                                  {t.status === "planned"
                                    ? "Planned"
                                    : t.status === "in_progress"
                                    ? "In corso"
                                    : t.status === "done"
                                    ? "Completato"
                                    : t.status === "cancelled"
                                    ? "Annullato"
                                    : t.status}
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
                                  onClick={() => loadTaskIntoForm(t)}
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
                                  onClick={() => handleDelete(t.id)}
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
        </>
      )}
    </div>
  );
}

export default Staff;
