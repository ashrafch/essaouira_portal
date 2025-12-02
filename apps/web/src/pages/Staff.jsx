import { useEffect, useMemo, useState } from "react";
import {
  getStaffTasks,
  getUnits,
  updateStaffTask,
  createStaffTask,
  getStaffDefaults,
  updateStaffDefaults,
  getStaffMembers,
} from "../services/api";

function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("it-IT");
}

function getMonday(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay(); // 0 domenica, 1 lun...
  const diff = (day === 0 ? -6 : 1) - day; // porta a lunedì
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Ruoli fissi allineati all'enum StaffRole del backend
const ROLE_OPTIONS = [
  { value: "housekeeping", label: "Housekeeping (pulizie / camere)" },
  { value: "kitchen", label: "Cucina / Colazioni" },
  { value: "reception_day", label: "Reception (giorno)" },
  { value: "reception_night", label: "Reception (notte)" },
  { value: "manager", label: "Manager / Amministratore" },
];

function getRoleLabel(value) {
  if (!value) return "";
  const opt = ROLE_OPTIONS.find((r) => r.value === value);
  return opt ? opt.label : value;
}

function Staff() {
  const todayStr = new Date().toISOString().slice(0, 10);

  const [mode, setMode] = useState("day"); // "day" | "week"
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const [units, setUnits] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [staffMembers, setStaffMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [unitFilter, setUnitFilter] = useState("all");
  const [taskTypeFilter, setTaskTypeFilter] = useState("all");

  const [savingTaskId, setSavingTaskId] = useState(null);

  // defaults staff (come nel vecchio Staff)
  const [defaultsLoading, setDefaultsLoading] = useState(true);
  const [defaultsSaving, setDefaultsSaving] = useState(false);
  const [defaultsMessage, setDefaultsMessage] = useState("");
  const [defAssignee, setDefAssignee] = useState("Operatore 1");
  const [defCost, setDefCost] = useState("5");
  const [defHours, setDefHours] = useState("1");
  const [defCurrency, setDefCurrency] = useState("EUR");

  // quick-create su cella (giorno + colonna assignee)
  const [quickCreateTarget, setQuickCreateTarget] = useState(null); // { date, assignee }
  const [quickType, setQuickType] = useState("cleaning");
  const [quickUnitId, setQuickUnitId] = useState("");
  const [quickCost, setQuickCost] = useState("");
  const [quickHours, setQuickHours] = useState("");
  const [quickNotes, setQuickNotes] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);

  // nuovo: scelta ruolo + assegnatario per il quick-create
  const [quickRole, setQuickRole] = useState("");
  const [quickAssignee, setQuickAssignee] = useState("");

  // mappa unità
  const unitMap = useMemo(
    () =>
      units.reduce((acc, u) => {
        acc[u.id] = u;
        return acc;
      }, {}),
    [units]
  );

  // range date in base alla modalità
  const { from_date, to_date, days } = useMemo(() => {
    if (mode === "day") {
      return {
        from_date: selectedDate,
        to_date: selectedDate,
        days: [selectedDate],
      };
    }
    const monday = getMonday(selectedDate);
    const daysArr = [];
    for (let i = 0; i < 7; i++) {
      daysArr.push(addDays(monday, i));
    }
    return {
      from_date: monday,
      to_date: addDays(monday, 6),
      days: daysArr,
    };
  }, [mode, selectedDate]);

  // caricamento units + defaults + staff una volta sola
  useEffect(() => {
    async function loadBase() {
      setDefaultsLoading(true);
      try {
        const [uns, defs, staff] = await Promise.all([
          getUnits(),
          getStaffDefaults(),
          getStaffMembers({ active_only: true }), // <-- usa solo staff attivi
        ]);
        setUnits(uns || []);
        setStaffMembers(staff || []);
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
        console.error("Errore caricando units/defaults/staff:", err);
      } finally {
        setDefaultsLoading(false);
      }
    }
    loadBase();
  }, []);

  // carica tasks in base a data/modalità
  useEffect(() => {
    async function loadTasks() {
      setLoading(true);
      setError(null);
      try {
        const params =
          mode === "day"
            ? { date: selectedDate }
            : { from_date, to_date };
        const tsks = await getStaffTasks(params);
        setTasks(tsks || []);
      } catch (err) {
        setError(err.message || "Errore caricando i task staff");
      } finally {
        setLoading(false);
      }
    }
    loadTasks();
  }, [mode, selectedDate, from_date, to_date]);

  // filtri base (unità, tipo)
  const filteredTasks = useMemo(
    () =>
      tasks.filter((t) => {
        const matchUnit =
          unitFilter === "all"
            ? true
            : t.unit_id != null && String(t.unit_id) === unitFilter;

        const matchType =
          taskTypeFilter === "all"
            ? true
            : (t.task_type || "") === taskTypeFilter;

        return matchUnit && matchType;
      }),
    [tasks, unitFilter, taskTypeFilter]
  );

  // KPI
  const kpi = useMemo(() => {
    const total = filteredTasks.length;
    const byStatus = filteredTasks.reduce(
      (acc, t) => {
        acc[t.status || "unknown"] = (acc[t.status || "unknown"] || 0) + 1;
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

  // lista ruoli (da anagrafica staff, come ENUM values)
  const staffRoles = useMemo(() => {
    const set = new Set();
    staffMembers.forEach((m) => {
      if (m.role) set.add(m.role);
    });
    const arr = Array.from(set);
    arr.sort((a, b) =>
      getRoleLabel(a).localeCompare(getRoleLabel(b))
    );
    return arr;
  }, [staffMembers]);

  // lista assignee per colonne della board
  const assignees = useMemo(() => {
    const nameSet = new Set();

    // 1) membri staff attivi (da Anagrafica)
    staffMembers
      .filter((m) => m.is_active)
      .forEach((m) => {
        if (m.name) nameSet.add(m.name);
      });

    // 2) nomi che compaiono nei task
    for (const t of filteredTasks) {
      const name = t.assignee_name || "Non assegnato";
      nameSet.add(name);
    }

    let arr = Array.from(nameSet);

    // togli eventuali duplicati e ordina (lasciando "Non assegnato" alla fine)
    const unassigned = "Non assegnato";
    arr = arr.filter((n) => n !== unassigned).sort((a, b) => a.localeCompare(b));
    arr.push(unassigned);

    // se esiste un default assignee, mettilo in testa
    if (defAssignee && arr.includes(defAssignee)) {
      arr = [defAssignee, ...arr.filter((x) => x !== defAssignee)];
    }

    return arr;
  }, [filteredTasks, defAssignee, staffMembers]);

  const assigneeOptions = assignees;

  // mappa nome → colore da Anagrafica
  const staffColorMap = useMemo(() => {
    const map = {};
    for (const m of staffMembers) {
      if (m.name && m.color_hex) {
        map[m.name] = m.color_hex;
      }
    }
    return map;
  }, [staffMembers]);

  // task per assignee + giorno
  const tasksByAssigneeAndDay = useMemo(() => {
    const map = {};
    for (const t of filteredTasks) {
      const ass = t.assignee_name || "Non assegnato";
      if (!map[ass]) map[ass] = {};
      const d = t.date;
      if (!map[ass][d]) map[ass][d] = [];
      map[ass][d].push(t);
    }
    for (const ass of Object.keys(map)) {
      for (const d of Object.keys(map[ass])) {
        map[ass][d].sort((a, b) => {
          const ta = a.time || "";
          const tb = b.time || "";
          return ta.localeCompare(tb);
        });
      }
    }
    return map;
  }, [filteredTasks]);

  const taskTypes = useMemo(() => {
    const set = new Set();
    for (const t of tasks) {
      if (t.task_type) set.add(t.task_type);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tasks]);

  function getTaskLabel(taskType) {
    if (taskType === "checkin") return "Check-in";
    if (taskType === "checkout") return "Check-out";
    if (taskType === "cleaning") return "Pulizia";
    if (taskType === "breakfast") return "Colazione";
    if (taskType === "maintenance") return "Manutenzione";
    return taskType || "Altro";
  }

  // ---- azioni su singolo task ----

  async function saveTask(taskId, partial) {
    const existing = tasks.find((t) => t.id === taskId);
    if (!existing) return;
    setSavingTaskId(taskId);
    try {
      const payload = {
        date: existing.date,
        time: existing.time,
        task_type: existing.task_type,
        assignee_name: existing.assignee_name,
        estimated_hours: existing.estimated_hours,
        status: existing.status,
        notes: existing.notes,
        cost: existing.cost,
        currency: existing.currency || "EUR",
        booking_id: existing.booking_id,
        unit_id: existing.unit_id,
        ...partial,
      };

      const updated = await updateStaffTask(taskId, payload);
      setTasks((prev) =>
        prev.map((t) => (t.id === updated.id ? updated : t))
      );
    } catch (err) {
      alert("Errore salvando il task: " + err.message);
    } finally {
      setSavingTaskId(null);
    }
  }

  function handleToggleStatus(task) {
    const newStatus = task.status === "done" ? "planned" : "done";
    saveTask(task.id, { status: newStatus });
  }

  function handleChangeCost(task, value) {
    const num = value === "" ? null : Number(value);
    if (Number.isNaN(num)) return;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, cost: num, _dirtyCost: true } : t
      )
    );
  }

  function handleBlurCost(task) {
    if (!task._dirtyCost) return;
    saveTask(task.id, { cost: task.cost ?? null });
  }

  function handleChangeHours(task, value) {
    const num = value === "" ? null : Number(value);
    if (Number.isNaN(num)) return;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, estimated_hours: num, _dirtyHours: true }
          : t
      )
    );
  }

  function handleBlurHours(task) {
    if (!task._dirtyHours) return;
    saveTask(task.id, { estimated_hours: task.estimated_hours ?? null });
  }

  // cambio assegnatario da select
  function handleChangeAssignee(task, newName) {
    const assignee =
      !newName || newName === "Non assegnato" ? null : newName;

    // ottimista: sposto la card di colonna
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, assignee_name: assignee } : t
      )
    );

    saveTask(task.id, { assignee_name: assignee });
  }

  // ---- quick-create su cella ----

  function openQuickCreate(date, assignee) {
    setQuickCreateTarget({ date, assignee });
    setQuickType("cleaning");
    setQuickUnitId("");
    setQuickCost(defCost || "");
    setQuickHours(defHours || "");
    setQuickNotes("");
    setQuickRole("");
    setQuickAssignee(assignee === "Non assegnato" ? "" : assignee);
  }

  function closeQuickCreate() {
    setQuickCreateTarget(null);
    setQuickType("cleaning");
    setQuickUnitId("");
    setQuickCost("");
    setQuickHours("");
    setQuickNotes("");
    setQuickRole("");
    setQuickAssignee("");
  }

  // assignees disponibili nel quick-create (filtrati per ruolo se selezionato)
  const quickAvailableAssignees = useMemo(() => {
    let list = staffMembers.filter((m) => m.is_active);
    if (quickRole) {
      list = list.filter((m) => m.role === quickRole);
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [staffMembers, quickRole]);

  async function handleQuickCreate(e) {
    if (e) e.preventDefault();
    if (!quickCreateTarget) return;
    const { date, assignee } = quickCreateTarget;

    // priorità: quickAssignee selezionato
    let chosenAssignee = null;
    if (quickAssignee && quickAssignee !== "Non assegnato") {
      chosenAssignee = quickAssignee;
    } else if (assignee && assignee !== "Non assegnato") {
      chosenAssignee = assignee;
    }

    const payload = {
      date,
      time: null,
      task_type: quickType,
      assignee_name: chosenAssignee,
      estimated_hours: quickHours !== "" ? Number(quickHours) : null,
      status: "planned",
      notes: quickNotes || null,
      cost: quickCost !== "" ? Number(quickCost) : null,
      currency: defCurrency || "EUR",
      booking_id: null,
      unit_id: quickUnitId !== "" ? Number(quickUnitId) : null,
    };

    setCreatingTask(true);
    try {
      const created = await createStaffTask(payload);
      setTasks((prev) => [...prev, created]);
      closeQuickCreate();
    } catch (err) {
      alert("Errore creando il task: " + err.message);
    } finally {
      setCreatingTask(false);
    }
  }

  // ---- impostazioni defaults staff ----

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

  // ---- STYLES ----

  const page = {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  };

  const header = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 4,
    flexWrap: "wrap",
    gap: 8,
  };

  const controlsRow = {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    fontSize: 12,
  };

  const card = {
    background: "white",
    borderRadius: 14,
    padding: 12,
    boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
    border: "1px solid #e5e7eb",
  };

  const sectionTitle = {
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 6,
    color: "#111827",
  };

  const smallButton = {
    borderRadius: 999,
    border: "1px solid #d1d5db",
    padding: "4px 10px",
    fontSize: 11,
    background: "white",
    cursor: "pointer",
  };

  const modeButton = (active) => ({
    ...smallButton,
    borderColor: active ? "#0f766e" : "#d1d5db",
    color: active ? "#0f766e" : "#374151",
    background: active ? "#ecfdf5" : "white",
  });

  const pillStatus = (status) => ({
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 11,
    backgroundColor: status === "done" ? "#dcfce7" : "#e5e7eb",
    color: status === "done" ? "#166534" : "#374151",
    border: `1px solid ${
      status === "done" ? "#16a34a" : "rgba(148,163,184,0.6)"
    }`,
    cursor: "pointer",
  });

  const boardWrapper = {
    overflowX: "auto",
  };

  const board = {
    minWidth: assignees.length ? assignees.length * 220 + 140 : 360,
    display: "grid",
    gridTemplateColumns: `140px repeat(${assignees.length || 1}, minmax(200px, 1fr))`,
    borderCollapse: "collapse",
    fontSize: 12,
  };

  const boardHeaderCell = {
    padding: "6px 4px",
    borderBottom: "1px solid #e5e7eb",
    fontSize: 11,
    color: "#6b7280",
    fontWeight: 500,
    textAlign: "center",
    background: "#f9fafb",
  };

  const boardDayCell = {
    padding: "6px 4px",
    borderBottom: "1px solid #e5e7eb",
    fontSize: 11,
    color: "#374151",
    background: "#f9fafb",
    fontWeight: 500,
  };

  const boardCell = {
    padding: 6,
    borderBottom: "1px solid #f3f4f6",
    borderRight: "1px solid #f3f4f6",
    verticalAlign: "top",
  };

  const miniTaskCard = (status) => ({
    borderRadius: 10,
    padding: 6,
    marginBottom: 4,
    border: "1px solid #e5e7eb",
    backgroundColor: status === "done" ? "#f0fdf4" : "white",
    boxShadow:
      status === "done"
        ? "0 0 0 1px rgba(34,197,94,0.1)"
        : "0 1px 2px rgba(15,23,42,0.06)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  });

  const inputInline = {
    width: "100%",
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    padding: "4px 6px",
    fontSize: 11,
  };

  const tagType = (taskType) => ({
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 6px",
    borderRadius: 999,
    fontSize: 10,
    backgroundColor:
      taskType === "checkin"
        ? "#dbeafe"
        : taskType === "checkout"
        ? "#fee2e2"
        : taskType === "cleaning"
        ? "#dcfce7"
        : taskType === "breakfast"
        ? "#fef9c3"
        : "#e5e7eb",
    color: "#111827",
  });

  const infoRow = {
    display: "flex",
    justifyContent: "space-between",
    gap: 4,
    alignItems: "center",
  };

  const layout = {
    display: "grid",
    gridTemplateColumns: "minmax(260px, 320px) 1fr",
    gap: 12,
    alignItems: "flex-start",
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

  const select = {
    ...input,
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

  const buttonSecondary = {
    borderRadius: 999,
    border: "1px solid #d1d5db",
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 500,
    backgroundColor: "white",
    color: "#374151",
    cursor: "pointer",
  };

  const kpiGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 8,
    marginBottom: 8,
  };

  const kpiCard = {
    background: "#f9fafb",
    borderRadius: 12,
    padding: "8px 10px",
  };

  const tinyLabel = {
    fontSize: 11,
    color: "#6b7280",
    marginBottom: 2,
  };

  const tinyValue = {
    fontSize: 18,
    fontWeight: 700,
  };

  const quickForm = {
    marginTop: 6,
    borderRadius: 10,
    border: "1px dashed #cbd5f5",
    background: "#f9fafb",
    padding: 6,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  };

  return (
    <div style={page}>
      <div style={header}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Staff & Pulizie</h1>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Board operativo per assegnare, completare e valorizzare i task
            dello staff. I costi qui finiscono direttamente nella Business.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div>
              <label
                style={{
                  fontSize: 11,
                  color: "#6b7280",
                  marginRight: 6,
                }}
              >
                Data di riferimento
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  padding: "6px 8px",
                  fontSize: 13,
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "flex-end" }}>
              <button
                type="button"
                style={modeButton(mode === "day")}
                onClick={() => setMode("day")}
              >
                Giorno
              </button>
              <button
                type="button"
                style={modeButton(mode === "week")}
                onClick={() => setMode("week")}
              >
                Settimana
              </button>
            </div>
          </div>
          <div style={controlsRow}>
            <div>
              <label
                style={{
                  fontSize: 11,
                  color: "#6b7280",
                  marginRight: 4,
                }}
              >
                Unità
              </label>
              <select
                value={unitFilter}
                onChange={(e) => setUnitFilter(e.target.value)}
                style={{
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  padding: "4px 8px",
                  fontSize: 12,
                  minWidth: 140,
                }}
              >
                <option value="all">Tutte le unità</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                style={{
                  fontSize: 11,
                  color: "#6b7280",
                  marginRight: 4,
                }}
              >
                Tipo task
              </label>
              <select
                value={taskTypeFilter}
                onChange={(e) => setTaskTypeFilter(e.target.value)}
                style={{
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  padding: "4px 8px",
                  fontSize: 12,
                  minWidth: 140,
                }}
              >
                <option value="all">Tutti i tipi</option>
                {taskTypes.map((tt) => (
                  <option key={tt} value={tt}>
                    {getTaskLabel(tt)}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>
              Task nel periodo: <strong>{kpi.total}</strong>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <p style={{ color: "red", fontSize: 12, marginBottom: 4 }}>{error}</p>
      )}

      <div style={layout}>
        {/* COLONNA SINISTRA: Defaults + KPI rapidi */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={card}>
            <div style={sectionTitle}>Riepilogo carico staff</div>
            <div style={kpiGrid}>
              <div style={kpiCard}>
                <div style={tinyLabel}>Task totali (filtrati)</div>
                <div style={tinyValue}>{kpi.total}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>
                  Done: {kpi.byStatus.done || 0} · Planned:{" "}
                  {kpi.byStatus.planned || 0}
                </div>
              </div>
              <div style={kpiCard}>
                <div style={tinyLabel}>Ore stimate</div>
                <div style={tinyValue}>{kpi.hours.toFixed(1)}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>
                  Somma di tutte le task filtrate
                </div>
              </div>
              <div style={kpiCard}>
                <div style={tinyLabel}>Costo complessivo</div>
                <div style={tinyValue}>€ {kpi.costTotal.toFixed(2)}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>
                  Finisce nella pagina Business (Staff)
                </div>
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={sectionTitle}>Impostazioni staff & default</div>
            <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>
              Questi valori vengono usati quando il sistema crea automaticamente
              task (es. pulizie al check-out). L'operatore di default appare
              anche come prima colonna nella board.
            </p>
            {defaultsLoading ? (
              <p style={{ fontSize: 12 }}>Caricamento impostazioni...</p>
            ) : (
              <form onSubmit={handleSaveDefaults}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
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
                  style={{ ...buttonPrimary, marginTop: 8 }}
                  disabled={defaultsSaving}
                >
                  {defaultsSaving
                    ? "Salvataggio..."
                    : "Salva impostazioni automatiche"}
                </button>
                {defaultsMessage && (
                  <p
                    style={{
                      fontSize: 11,
                      color: "#6b7280",
                      marginTop: 4,
                    }}
                  >
                    {defaultsMessage}
                  </p>
                )}
              </form>
            )}
          </div>
        </div>

        {/* COLONNA DESTRA: BOARD */}
        <div style={card}>
          <div style={sectionTitle}>
            {mode === "day"
              ? `Vista giornaliera · ${formatDate(selectedDate)}`
              : `Vista settimanale · ${formatDate(from_date)} → ${formatDate(
                  to_date
                )}`}
          </div>

          {loading ? (
            <p style={{ fontSize: 13 }}>Caricamento task staff...</p>
          ) : filteredTasks.length === 0 ? (
            <p style={{ fontSize: 12, color: "#6b7280" }}>
              Nessun task staff per il periodo e i filtri selezionati.
            </p>
          ) : (
            <div style={boardWrapper}>
              <div style={board}>
                {/* header: colonna giorni + colonne per assignee */}
                <div style={boardHeaderCell}>Giorno</div>
                {assignees.map((ass) => {
                  const color = staffColorMap[ass];
                  return (
                    <div key={ass} style={boardHeaderCell}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                        }}
                      >
                        {color && (
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: "999px",
                              backgroundColor: color,
                              border: "1px solid rgba(0,0,0,0.15)",
                            }}
                          />
                        )}
                        <span>{ass}</span>
                      </div>
                    </div>
                  );
                })}

                {/* righe per ogni giorno */}
                {days.map((d) => (
                  <div key={d} style={{ display: "contents" }}>
                    {/* prima colonna: giorno */}
                    <div style={boardDayCell}>
                      <div>{formatDate(d)}</div>
                      <div style={{ fontSize: 10, color: "#6b7280" }}>{d}</div>
                    </div>
                    {/* celle per ogni assignee */}
                    {assignees.map((ass) => {
                      const list = tasksByAssigneeAndDay[ass]?.[d] || [];
                      const isQuick =
                        quickCreateTarget &&
                        quickCreateTarget.date === d &&
                        quickCreateTarget.assignee === ass;

                      return (
                        <div key={ass + d} style={boardCell}>
                          {list.length === 0 && !isQuick && (
                            <span
                              style={{
                                fontSize: 10,
                                color: "#9ca3af",
                                display: "block",
                                marginBottom: 4,
                              }}
                            >
                              Nessun task
                            </span>
                          )}

                          {list.map((t) => {
                            const unit = t.unit_id
                              ? unitMap[t.unit_id]
                              : null;
                            const isSaving = savingTaskId === t.id;
                            return (
                              <div
                                key={t.id}
                                style={miniTaskCard(t.status)}
                              >
                                <div style={infoRow}>
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 500,
                                    }}
                                  >
                                    {t.time || "—"}
                                  </span>
                                  <span style={tagType(t.task_type)}>
                                    {getTaskLabel(t.task_type)}
                                  </span>
                                </div>
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: "#4b5563",
                                  }}
                                >
                                  {unit
                                    ? unit.name
                                    : t.unit_id
                                    ? `Unit #${t.unit_id}`
                                    : "Senza unità"}
                                </div>
                                {t.notes && (
                                  <div
                                    style={{
                                      fontSize: 10,
                                      color: "#6b7280",
                                      marginTop: 2,
                                    }}
                                  >
                                    {t.notes}
                                  </div>
                                )}

                                {/* select assegnatario */}
                                <div style={{ marginTop: 4 }}>
                                  <select
                                    style={inputInline}
                                    value={t.assignee_name || "Non assegnato"}
                                    onChange={(e) =>
                                      handleChangeAssignee(
                                        t,
                                        e.target.value
                                      )
                                    }
                                  >
                                    {assigneeOptions.map((name) => (
                                      <option key={name} value={name}>
                                        {name}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns:
                                      "1fr 1fr auto",
                                    gap: 4,
                                    marginTop: 4,
                                    alignItems: "center",
                                  }}
                                >
                                  <div>
                                    <div
                                      style={{
                                        fontSize: 10,
                                        color: "#6b7280",
                                        marginBottom: 2,
                                      }}
                                    >
                                      Costo
                                    </div>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={
                                        t.cost === null ||
                                        t.cost === undefined
                                          ? ""
                                          : t.cost
                                      }
                                      onChange={(e) =>
                                        handleChangeCost(
                                          t,
                                          e.target.value
                                        )
                                      }
                                      onBlur={() => handleBlurCost(t)}
                                      style={inputInline}
                                    />
                                  </div>
                                  <div>
                                    <div
                                      style={{
                                        fontSize: 10,
                                        color: "#6b7280",
                                        marginBottom: 2,
                                      }}
                                    >
                                      Ore
                                    </div>
                                    <input
                                      type="number"
                                      step="0.25"
                                      value={
                                        t.estimated_hours === null ||
                                        t.estimated_hours ===
                                          undefined
                                          ? ""
                                          : t.estimated_hours
                                      }
                                      onChange={(e) =>
                                        handleChangeHours(
                                          t,
                                          e.target.value
                                        )
                                      }
                                      onBlur={() => handleBlurHours(t)}
                                      style={inputInline}
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    style={pillStatus(t.status)}
                                    onClick={() =>
                                      handleToggleStatus(t)
                                    }
                                    disabled={isSaving}
                                  >
                                    {isSaving
                                      ? "..."
                                      : t.status === "done"
                                      ? "Fatto"
                                      : "Da fare"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                          {/* quick add */}
                          {isQuick ? (
                            <form
                              style={quickForm}
                              onSubmit={handleQuickCreate}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent:
                                    "space-between",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 500,
                                  }}
                                >
                                  Nuovo task
                                </span>
                                <button
                                  type="button"
                                  style={buttonSecondary}
                                  onClick={closeQuickCreate}
                                >
                                  ×
                                </button>
                              </div>

                              {/* tipo + unità */}
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns:
                                    "1fr 1fr",
                                  gap: 4,
                                }}
                              >
                                <select
                                  style={inputInline}
                                  value={quickType}
                                  onChange={(e) =>
                                    setQuickType(e.target.value)
                                  }
                                >
                                  <option value="cleaning">
                                    Pulizia
                                  </option>
                                  <option value="checkin">
                                    Check-in
                                  </option>
                                  <option value="checkout">
                                    Check-out
                                  </option>
                                  <option value="breakfast">
                                    Colazione
                                  </option>
                                  <option value="maintenance">
                                    Manutenzione
                                  </option>
                                  <option value="other">
                                    Altro
                                  </option>
                                </select>
                                <select
                                  style={inputInline}
                                  value={quickUnitId}
                                  onChange={(e) =>
                                    setQuickUnitId(e.target.value)
                                  }
                                >
                                  <option value="">
                                    Nessuna unità
                                  </option>
                                  {units.map((u) => (
                                    <option
                                      key={u.id}
                                      value={u.id}
                                    >
                                      {u.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* ruolo + assegnatario */}
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns:
                                    "1fr 1fr",
                                  gap: 4,
                                }}
                              >
                                <select
                                  style={inputInline}
                                  value={quickRole}
                                  onChange={(e) => {
                                    setQuickRole(e.target.value);
                                    setQuickAssignee("");
                                  }}
                                >
                                  <option value="">
                                    Tutti i ruoli
                                  </option>
                                  {staffRoles.map((r) => (
                                    <option key={r} value={r}>
                                      {getRoleLabel(r)}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  style={inputInline}
                                  value={quickAssignee}
                                  onChange={(e) =>
                                    setQuickAssignee(e.target.value)
                                  }
                                >
                                  <option value="">
                                    Nessun assegnatario
                                  </option>
                                  {quickAvailableAssignees.map((m) => (
                                    <option key={m.id} value={m.name}>
                                      {m.name}
                                      {m.role
                                        ? ` (${getRoleLabel(
                                            m.role
                                          )})`
                                        : ""}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* costi + ore */}
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns:
                                    "1fr 1fr",
                                  gap: 4,
                                }}
                              >
                                <input
                                  style={inputInline}
                                  type="number"
                                  step="0.01"
                                  placeholder="Costo"
                                  value={quickCost}
                                  onChange={(e) =>
                                    setQuickCost(e.target.value)
                                  }
                                />
                                <input
                                  style={inputInline}
                                  type="number"
                                  step="0.25"
                                  placeholder="Ore"
                                  value={quickHours}
                                  onChange={(e) =>
                                    setQuickHours(e.target.value)
                                  }
                                />
                              </div>

                              {/* note */}
                              <textarea
                                style={{
                                  ...inputInline,
                                  minHeight: 40,
                                  resize: "vertical",
                                }}
                                placeholder="Note (opzionale)"
                                value={quickNotes}
                                onChange={(e) =>
                                  setQuickNotes(e.target.value)
                                }
                              />

                              <button
                                type="submit"
                                style={{
                                  ...buttonPrimary,
                                  fontSize: 11,
                                  padding: "6px 10px",
                                  alignSelf: "flex-start",
                                }}
                                disabled={creatingTask}
                              >
                                {creatingTask
                                  ? "Creazione..."
                                  : "Crea task"}
                              </button>
                            </form>
                          ) : (
                            <button
                              type="button"
                              style={{
                                ...buttonSecondary,
                                marginTop: 4,
                                fontSize: 11,
                                padding: "4px 8px",
                              }}
                              onClick={() => openQuickCreate(d, ass)}
                            >
                              + Aggiungi task
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Staff;
