import { useEffect, useMemo, useState } from "react";
import {
  getStaffTasks,
  getUnits,
  updateStaffTask,
  createStaffTask,
  deleteStaffTask,
  getStaffDefaults,
  updateStaffDefaults,
  getStaffMembers,
  getMaintenanceTickets, // <-- NUOVO IMPORT
} from "../services/api";
import { getCurrentRole } from "../services/auth";
import { PageHeader, Button, useToast } from "../components/ui";

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
  const toast = useToast();
  const todayStr = new Date().toISOString().slice(0, 10);

  const [mode, setMode] = useState("day"); // "day" | "week"
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const [units, setUnits] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [staffMembers, setStaffMembers] = useState([]);
  const [maintenanceTickets, setMaintenanceTickets] = useState([]); // <-- NUOVO STATO
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  const [unitFilter, setUnitFilter] = useState("all");
  const [taskTypeFilter, setTaskTypeFilter] = useState("all");

  const [savingTaskId, setSavingTaskId] = useState(null);

  // defaults staff
  const [defaultsLoading, setDefaultsLoading] = useState(true);
  const [defaultsSaving, setDefaultsSaving] = useState(false);
  const [defaultsMessage, setDefaultsMessage] = useState("");
  const [defAssignee, setDefAssignee] = useState("Operatore 1");
  const [defCost, setDefCost] = useState("5");
  const [defHours, setDefHours] = useState("1");
  const [defCurrency, setDefCurrency] = useState("EUR");

  // form task singolo (modale / edit)
  const [formMode, setFormMode] = useState("create"); 
  const [editingId, setEditingId] = useState(null);
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
  const [saving, setSaving] = useState(false);
  const canManageDefaults = ["owner", "manager"].includes(
    (getCurrentRole() || "viewer").toLowerCase()
  );
  const [staffPage, setStaffPage] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1600
  );

  // quick-create su cella
  const [quickCreateTarget, setQuickCreateTarget] = useState(null); 
  const [quickType, setQuickType] = useState("cleaning");
  const [quickUnitId, setQuickUnitId] = useState("");
  const [quickCost, setQuickCost] = useState("");
  const [quickHours, setQuickHours] = useState("");
  const [quickNotes, setQuickNotes] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);

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

  // range date
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

  // caricamento iniziale
  useEffect(() => {
    async function loadBase() {
      setDefaultsLoading(true);
      try {
        const [uns, defs, staff, tickets] = await Promise.all([
          getUnits(),
          getStaffDefaults(),
          getStaffMembers({ active_only: true }),
          getMaintenanceTickets(),
        ]);
        
        setUnits(uns || []);
        setStaffMembers(staff || []);
        setMaintenanceTickets(tickets || []);
        
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
        console.error("Errore caricando dati base:", err);
      } finally {
        setDefaultsLoading(false);
      }
    }
    loadBase();
  }, []);

  // carica tasks
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

  const assignees = useMemo(() => {
    const nameSet = new Set();
    staffMembers
      .filter((m) => m.is_active)
      .forEach((m) => {
        if (m.name) nameSet.add(m.name);
      });
    for (const t of filteredTasks) {
      const name = t.assignee_name || "Non assegnato";
      nameSet.add(name);
    }
    let arr = Array.from(nameSet);
    const unassigned = "Non assegnato";
    arr = arr.filter((n) => n !== unassigned).sort((a, b) => a.localeCompare(b));
    arr.push(unassigned);
    if (defAssignee && arr.includes(defAssignee)) {
      arr = [defAssignee, ...arr.filter((x) => x !== defAssignee)];
    }
    return arr;
  }, [filteredTasks, defAssignee, staffMembers]);

  const assigneeOptions = assignees;
  const staffColumnsPerPage = useMemo(() => {
    if (viewportWidth <= 900) return 1;
    if (viewportWidth <= 1300) return 2;
    return 3;
  }, [viewportWidth]);

  const totalStaffPages = useMemo(
    () => Math.max(1, Math.ceil((assignees.length || 1) / staffColumnsPerPage)),
    [assignees.length, staffColumnsPerPage]
  );

  useEffect(() => {
    setStaffPage((prev) => Math.min(prev, totalStaffPages - 1));
  }, [totalStaffPages]);

  useEffect(() => {
    if (mode === "day" && staffPage !== 0) {
      setStaffPage(0);
    }
  }, [mode, staffPage]);

  const visibleAssignees = useMemo(() => {
    if (mode === "day") return assignees;
    const start = staffPage * staffColumnsPerPage;
    return assignees.slice(start, start + staffColumnsPerPage);
  }, [assignees, mode, staffPage, staffColumnsPerPage]);

  useEffect(() => {
    function onResize() {
      setViewportWidth(window.innerWidth);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const staffColorMap = useMemo(() => {
    const map = {};
    for (const m of staffMembers) {
      if (m.name && m.color_hex) {
        map[m.name] = m.color_hex;
      }
    }
    return map;
  }, [staffMembers]);

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

  // -- LOGICA TICKET MANUTENZIONE --
  const openTickets = useMemo(() => {
    return maintenanceTickets.filter(t => t.status !== 'done');
  }, [maintenanceTickets]);


  // ---- AZIONI ----

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
      toast.error("Errore salvando il task: " + err.message);
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

  function handleChangeAssignee(task, newName) {
    const assignee =
      !newName || newName === "Non assegnato" ? null : newName;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, assignee_name: assignee } : t
      )
    );
    saveTask(task.id, { assignee_name: assignee });
  }

  // ---- QUICK CREATE ----

  function openQuickCreate(date, assignee) {
    resetForm();
    setDate(date);
    setTaskType("cleaning");
    setAssigneeName(assignee === "Non assegnato" ? "" : assignee);
    setCost(defCost || "");
    setEstimatedHours(defHours || "");
    setCurrency(defCurrency || "EUR");
    setIsTaskModalOpen(true);
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
    setIsTaskModalOpen(false);
  }

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
      toast.error("Errore creando il task: " + err.message);
    } finally {
      setCreatingTask(false);
    }
  }

  // Funzioni per il form completo (nel container in basso)
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

  function openCreateTaskModal() {
    resetForm();
    setDate(selectedDate);
    setAssigneeName(defAssignee || "");
    setCost(defCost || "");
    setEstimatedHours(defHours || "");
    setCurrency(defCurrency || "EUR");
    setIsTaskModalOpen(true);
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
    setIsTaskModalOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!date || !taskType) {
      toast.error("La data e il tipo di task sono obbligatori.");
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
      time: null, 
    };

    setSaving(true);
    setError(null);
    try {
      let saved;
      if (formMode === "edit" && editingId != null) {
        saved = await updateStaffTask(editingId, payload);
        setTasks((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
        toast.success("Task aggiornato.");
      } else {
        saved = await createStaffTask(payload);
        setTasks((prev) => [...prev, saved]);
        toast.success("Task creato.");
      }
      resetForm();
      setIsTaskModalOpen(false);
    } catch (err) {
      toast.error(err.message || "Errore salvataggio task");
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
      toast.success("Task eliminato.");
    } catch (err) {
      toast.error("Errore eliminando il task: " + err.message);
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

  // ---- STYLES ----

  const page = {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  };

  const controlsRow = {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    fontSize: 12,
  };

  const card = {
    background: "var(--color-surface)",
    borderRadius: 14,
    padding: 12,
    boxShadow: "var(--shadow-sm)",
    border: "1px solid var(--color-border)",
  };

  const sectionTitle = {
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 6,
    color: "var(--color-text)",
  };

  const smallButton = {
    borderRadius: 999,
    border: "1px solid var(--color-border-strong)",
    padding: "4px 10px",
    fontSize: 11,
    background: "var(--color-surface)",
    cursor: "pointer",
  };

  const modeButton = (active) => ({
    ...smallButton,
    borderColor: active ? "var(--color-primary)" : "var(--color-border-strong)",
    color: active ? "var(--color-primary)" : "var(--color-text-muted)",
    background: active ? "var(--color-primary-soft)" : "var(--color-surface)",
  });

  const pillStatus = (status) => ({
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 11,
    backgroundColor:
      status === "done" ? "var(--color-success-soft)" : "var(--color-border)",
    color: status === "done" ? "var(--color-success-strong)" : "var(--color-text)",
    border: `1px solid ${
      status === "done" ? "var(--color-success)" : "var(--color-border-strong)"
    }`,
    cursor: "pointer",
  });

  const boardWrapper = {
    overflowX: "hidden",
    width: "100%",
  };

  const board = {
    minWidth: "100%",
    display: "grid",
    gridTemplateColumns: `130px repeat(${visibleAssignees.length || 1}, minmax(0, 1fr))`,
    borderCollapse: "collapse",
    fontSize: 12,
  };

  const boardHeaderCell = {
    padding: "6px 4px",
    borderBottom: "1px solid var(--color-border)",
    fontSize: 11,
    color: "var(--color-text-muted)",
    fontWeight: 500,
    textAlign: "center",
    background: "var(--color-surface-soft)",
  };

  const boardDayCell = {
    padding: "6px 4px",
    borderBottom: "1px solid var(--color-border)",
    fontSize: 11,
    color: "var(--color-text)",
    background: "var(--color-surface-soft)",
    fontWeight: 500,
  };

  const boardCell = {
    padding: 6,
    borderBottom: "1px solid var(--color-border)",
    borderRight: "1px solid var(--color-border)",
    verticalAlign: "top",
    minWidth: 0,
  };

  const miniTaskCard = (status) => ({
    borderRadius: 10,
    padding: 6,
    marginBottom: 4,
    border: "1px solid var(--color-border)",
    backgroundColor:
      status === "done" ? "var(--color-success-soft)" : "var(--color-surface)",
    boxShadow:
      status === "done"
        ? "0 0 0 1px var(--color-success)"
        : "var(--shadow-sm)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  });

  const inputInline = {
    width: "100%",
    borderRadius: 8,
    border: "1px solid var(--color-border)",
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
        ? "var(--color-info-soft)"
        : taskType === "checkout"
        ? "var(--color-danger-soft)"
        : taskType === "cleaning"
        ? "var(--color-success-soft)"
        : taskType === "breakfast"
        ? "var(--color-warning-soft)"
        : "var(--color-border)",
    color: "var(--color-text)",
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
    color: "var(--color-text-muted)",
  };

  const input = {
    borderRadius: 8,
    border: "1px solid var(--color-border-strong)",
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

  const kpiGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 8,
    marginBottom: 8,
  };

  const kpiCard = {
    background: "var(--color-surface-soft)",
    borderRadius: 12,
    padding: "8px 10px",
  };

  const tinyLabel = {
    fontSize: 11,
    color: "var(--color-text-muted)",
    marginBottom: 2,
  };

  const tinyValue = {
    fontSize: 18,
    fontWeight: 700,
  };

  const quickForm = {
    marginTop: 6,
    borderRadius: 10,
    border: "1px dashed var(--color-border-strong)",
    background: "var(--color-surface-soft)",
    padding: 6,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  };

  const ticketCardStyle = {
    backgroundColor: "var(--color-warning-soft)",
    border: "1px solid var(--color-warning)",
    borderRadius: 8,
    padding: "10px",
    marginBottom: 8,
    fontSize: 12,
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
    padding: "6px 4px",
    borderBottom: "1px solid var(--color-border)",
  };

  return (
    <div style={page}>
      <PageHeader
        title="Staff & Pulizie"
        subtitle="Board operativo per assegnare, completare e valorizzare i task dello staff. I costi qui finiscono direttamente nella Business."
        actions={
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div>
              <label
                style={{
                  fontSize: 11,
                  color: "var(--color-text-muted)",
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
                  border: "1px solid var(--color-border-strong)",
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
                  color: "var(--color-text-muted)",
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
                  border: "1px solid var(--color-border-strong)",
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
                  color: "var(--color-text-muted)",
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
                  border: "1px solid var(--color-border-strong)",
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
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
              Task nel periodo: <strong>{kpi.total}</strong>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={openCreateTaskModal}
            >
              + Nuovo task
            </Button>
          </div>
          </div>
        }
      />

      {error && (
        <p style={{ color: "var(--color-danger)", fontSize: 12, marginBottom: 4 }}>{error}</p>
      )}
      {isTaskModalOpen && (
        <div
          onClick={() => setIsTaskModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--color-overlay)",
            zIndex: 1100,
          }}
        />
      )}

      <div style={layout}>
        {/* COLONNA SINISTRA: Manutenzione + KPI + Defaults */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          
          {/* WIDGET TICKET MANUTENZIONE */}
          <div style={card}>
             <div style={sectionTitle}>🔧 Segnalazioni Aperte ({openTickets.length})</div>
             {openTickets.length === 0 ? (
                 <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Nessuna manutenzione pendente.</p>
             ) : (
                 <div style={{ maxHeight: 300, overflowY: "auto" }}>
                     {openTickets.map(t => (
                         <div key={t.id} style={ticketCardStyle}>
                             <div style={{ fontWeight: 600, marginBottom: 2 }}>{t.title}</div>
                             <div style={{ color: "var(--color-text-muted)", marginBottom: 4 }}>
                                 {t.unit_id ? (unitMap[t.unit_id]?.name || `Unit #${t.unit_id}`) : "Struttura"} · {t.priority}
                             </div>
                             {t.assigned_to_id && (
                                 <div style={{ color: "var(--color-success)" }}>
                                     Assegnato a: {staffMembers.find(s => s.id === t.assigned_to_id)?.name || "?"}
                                 </div>
                             )}
                         </div>
                     ))}
                 </div>
             )}
          </div>

          {/* KPI Card */}
          <div style={card}>
            <div style={sectionTitle}>Riepilogo carico staff</div>
            <div style={kpiGrid}>
              <div style={kpiCard}>
                <div style={tinyLabel}>Task totali</div>
                <div style={tinyValue}>{kpi.total}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-subtle)" }}>
                  Done: {kpi.byStatus.done || 0} · Planned:{" "}
                  {kpi.byStatus.planned || 0}
                </div>
              </div>
              <div style={kpiCard}>
                <div style={tinyLabel}>Ore stimate</div>
                <div style={tinyValue}>{kpi.hours.toFixed(1)}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-subtle)" }}>
                  Totale task filtrate
                </div>
              </div>
              <div style={kpiCard}>
                <div style={tinyLabel}>Costo</div>
                <div style={tinyValue}>€ {kpi.costTotal.toFixed(2)}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-subtle)" }}>
                  Business (Staff)
                </div>
              </div>
            </div>
          </div>

          {/* Default settings */}
          <div style={card}>
            <div style={sectionTitle}>Impostazioni staff & default</div>
            <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 8 }}>
              Questi valori vengono usati quando il sistema crea automaticamente
              task (es. pulizie al check-out).
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
                    <label style={label}>Costo base (€)</label>
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
                <Button
                  type="submit"
                  variant="primary"
                  style={{ marginTop: 8 }}
                  disabled={defaultsSaving || !canManageDefaults}
                >
                  {defaultsSaving
                    ? "Salvataggio..."
                    : "Salva impostazioni automatiche"}
                </Button>
                {!canManageDefaults && (
                  <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 6 }}>
                    Ruolo in sola operativita': puoi leggere i default ma non modificarli.
                  </p>
                )}
                {defaultsMessage && (
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--color-text-muted)",
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

          {mode === "week" && assignees.length > staffColumnsPerPage && (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setStaffPage((p) => Math.max(0, p - 1))}
                disabled={staffPage === 0}
              >
                Staff precedenti
              </Button>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Pagina staff {staffPage + 1}/{totalStaffPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setStaffPage((p) => Math.min(totalStaffPages - 1, p + 1))}
                disabled={staffPage >= totalStaffPages - 1}
              >
                Staff successivi
              </Button>
            </div>
          )}

          {loading ? (
            <p style={{ fontSize: 13 }}>Caricamento task staff...</p>
          ) : filteredTasks.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              Nessun task staff per il periodo e i filtri selezionati.
            </p>
          ) : (
            <div style={boardWrapper}>
              <div style={board}>
                {/* header: colonna giorni + colonne per assignee */}
                <div style={boardHeaderCell}>Giorno</div>
                {visibleAssignees.map((ass) => {
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
                              border: "1px solid var(--color-border)",
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
                      <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{d}</div>
                    </div>
                    {/* celle per ogni assignee */}
                    {visibleAssignees.map((ass) => {
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
                                color: "var(--color-text-subtle)",
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
                                    color: "var(--color-text-muted)",
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
                                      color: "var(--color-text-muted)",
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
                                    disabled
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
                                        color: "var(--color-text-muted)",
                                        marginBottom: 2,
                                      }}
                                    >
                                      Costo
                                    </div>
                                    <input
                                      type="number"
                                      step="0.01"
                                      disabled
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
                                        color: "var(--color-text-muted)",
                                        marginBottom: 2,
                                      }}
                                    >
                                      Ore
                                    </div>
                                    <input
                                      type="number"
                                      step="0.25"
                                      disabled
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
                                    disabled
                                    onClick={() =>
                                      handleToggleStatus(t)
                                    }
                                  >
                                    {isSaving
                                      ? "..."
                                      : t.status === "done"
                                      ? "Fatto"
                                      : "Da fare"}
                                  </button>
                                </div>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  style={{ marginTop: 4 }}
                                  onClick={() => loadTaskIntoForm(t)}
                                >
                                  Modifica
                                </Button>
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
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={closeQuickCreate}
                                >
                                  ×
                                </Button>
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

                              <Button
                                type="submit"
                                variant="primary"
                                size="sm"
                                style={{ alignSelf: "flex-start" }}
                                disabled={creatingTask}
                              >
                                {creatingTask
                                  ? "Creazione..."
                                  : "Crea task"}
                              </Button>
                            </form>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              style={{ marginTop: 4 }}
                              onClick={() => openQuickCreate(d, ass)}
                            >
                              + Aggiungi task
                            </Button>
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

        {/* Form Task Singolo in fondo alla pagina */}
        <div
          style={{
            ...card,
            display: isTaskModalOpen ? "block" : "none",
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
              ? "Nuovo task staff (dettagliato)"
              : `Modifica task #${editingId}`}
          </h2>

          <form onSubmit={handleSubmit}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 12,
              }}
            >
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
              <Button
                type="submit"
                variant="primary"
                disabled={saving}
              >
                {saving
                  ? "Salvataggio..."
                  : formMode === "create"
                  ? "Crea task"
                  : "Salva modifiche"}
              </Button>
              {formMode === "edit" && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    resetForm();
                    setIsTaskModalOpen(false);
                  }}
                >
                  Annulla modifica
                </Button>
              )}
              {formMode === "create" && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    resetForm();
                    setIsTaskModalOpen(false);
                  }}
                >
                  Chiudi
                </Button>
              )}
            </div>
          </form>
        </div>

        {/* LISTA TASK GLOBALE */}
        <div style={{ gridColumn: "1 / -1", ...card }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
              gap: 8,
            }}
          >
            <h2 style={{ fontSize: 14 }}>Agenda staff (lista completa)</h2>
          </div>

          {filteredTasks.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
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
                            {getTaskLabel(t.task_type)}
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
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => loadTaskIntoForm(t)}
                            >
                              Modifica
                            </Button>{" "}
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleDelete(t.id)}
                            >
                              Elimina
                            </Button>
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
    </div>
  );
}

export default Staff;
