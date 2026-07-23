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
import { PageHeader, useToast } from "../components/ui";
import {
  getMonday,
  addDays,
  getRoleLabel,
} from "../components/staff/staffHelpers";
import { page, layout } from "../components/staff/staffStyles";
import StaffFilters from "../components/staff/StaffFilters";
import MaintenanceTicketsWidget from "../components/staff/MaintenanceTicketsWidget";
import StaffKpiCard from "../components/staff/StaffKpiCard";
import StaffDefaultsForm from "../components/staff/StaffDefaultsForm";
import StaffBoard from "../components/staff/StaffBoard";
import TaskFormModal from "../components/staff/TaskFormModal";
import StaffTaskTable from "../components/staff/StaffTaskTable";

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
          mode === "day" ? { date: selectedDate } : { from_date, to_date };
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
    const costTotal = filteredTasks.reduce((sum, t) => sum + (t.cost || 0), 0);
    return { total, byStatus, hours, costTotal };
  }, [filteredTasks]);

  const staffRoles = useMemo(() => {
    const set = new Set();
    staffMembers.forEach((m) => {
      if (m.role) set.add(m.role);
    });
    const arr = Array.from(set);
    arr.sort((a, b) => getRoleLabel(a).localeCompare(getRoleLabel(b)));
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

  // -- LOGICA TICKET MANUTENZIONE --
  const openTickets = useMemo(() => {
    return maintenanceTickets.filter((t) => t.status !== "done");
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
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
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
    const assignee = !newName || newName === "Non assegnato" ? null : newName;
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

  return (
    <div style={page}>
      <PageHeader
        title="Staff & Pulizie"
        subtitle="Board operativo per assegnare, completare e valorizzare i task dello staff. I costi qui finiscono direttamente nella Business."
        actions={
          <StaffFilters
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            mode={mode}
            setMode={setMode}
            unitFilter={unitFilter}
            setUnitFilter={setUnitFilter}
            units={units}
            taskTypeFilter={taskTypeFilter}
            setTaskTypeFilter={setTaskTypeFilter}
            taskTypes={taskTypes}
            kpiTotal={kpi.total}
            onCreateTask={openCreateTaskModal}
          />
        }
      />

      {error && (
        <p style={{ color: "var(--color-danger)", fontSize: 12, marginBottom: 4 }}>
          {error}
        </p>
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
          <MaintenanceTicketsWidget
            openTickets={openTickets}
            unitMap={unitMap}
            staffMembers={staffMembers}
          />

          <StaffKpiCard kpi={kpi} />

          <StaffDefaultsForm
            defaultsLoading={defaultsLoading}
            onSubmit={handleSaveDefaults}
            defAssignee={defAssignee}
            setDefAssignee={setDefAssignee}
            defCost={defCost}
            setDefCost={setDefCost}
            defHours={defHours}
            setDefHours={setDefHours}
            defCurrency={defCurrency}
            setDefCurrency={setDefCurrency}
            defaultsSaving={defaultsSaving}
            canManageDefaults={canManageDefaults}
            defaultsMessage={defaultsMessage}
          />
        </div>

        {/* COLONNA DESTRA: BOARD */}
        <StaffBoard
          mode={mode}
          selectedDate={selectedDate}
          from_date={from_date}
          to_date={to_date}
          assignees={assignees}
          visibleAssignees={visibleAssignees}
          staffColumnsPerPage={staffColumnsPerPage}
          staffPage={staffPage}
          setStaffPage={setStaffPage}
          totalStaffPages={totalStaffPages}
          loading={loading}
          filteredTasks={filteredTasks}
          staffColorMap={staffColorMap}
          days={days}
          tasksByAssigneeAndDay={tasksByAssigneeAndDay}
          quickCreateTarget={quickCreateTarget}
          unitMap={unitMap}
          savingTaskId={savingTaskId}
          assigneeOptions={assigneeOptions}
          onChangeAssignee={handleChangeAssignee}
          onChangeCost={handleChangeCost}
          onBlurCost={handleBlurCost}
          onChangeHours={handleChangeHours}
          onBlurHours={handleBlurHours}
          onToggleStatus={handleToggleStatus}
          onEditTask={loadTaskIntoForm}
          onOpenQuickCreate={openQuickCreate}
          quick={{
            quickType,
            setQuickType,
            quickUnitId,
            setQuickUnitId,
            units,
            quickRole,
            setQuickRole,
            staffRoles,
            quickAssignee,
            setQuickAssignee,
            quickAvailableAssignees,
            quickCost,
            setQuickCost,
            quickHours,
            setQuickHours,
            quickNotes,
            setQuickNotes,
            onSubmit: handleQuickCreate,
            onClose: closeQuickCreate,
            creatingTask,
          }}
        />

        {/* Form Task Singolo (modale) */}
        <TaskFormModal
          isOpen={isTaskModalOpen}
          formMode={formMode}
          editingId={editingId}
          onSubmit={handleSubmit}
          onClose={() => {
            resetForm();
            setIsTaskModalOpen(false);
          }}
          date={date}
          setDate={setDate}
          taskType={taskType}
          setTaskType={setTaskType}
          assigneeName={assigneeName}
          setAssigneeName={setAssigneeName}
          unitId={unitId}
          setUnitId={setUnitId}
          units={units}
          estimatedHours={estimatedHours}
          setEstimatedHours={setEstimatedHours}
          status={status}
          setStatus={setStatus}
          cost={cost}
          setCost={setCost}
          currency={currency}
          setCurrency={setCurrency}
          notes={notes}
          setNotes={setNotes}
          saving={saving}
        />

        {/* LISTA TASK GLOBALE */}
        <StaffTaskTable
          filteredTasks={filteredTasks}
          unitMap={unitMap}
          onEditTask={loadTaskIntoForm}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}

export default Staff;
