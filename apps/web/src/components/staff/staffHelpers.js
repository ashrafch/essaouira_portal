/**
 * Pure label / date helpers shared by Staff.jsx and its sub-components.
 *
 * NOTE on date helpers: getMonday/addDays operate on `YYYY-MM-DD` strings and
 * return `YYYY-MM-DD` strings via toISOString(). They are intentionally NOT
 * swapped for utils/dateUtils (which work on Date objects and format with local
 * time components) because the two have different UTC-vs-local semantics and
 * these strings feed API params and board day-keys — see Staff.jsx.
 */

export function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("it-IT");
}

export function getMonday(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay(); // 0 domenica, 1 lun...
  const diff = (day === 0 ? -6 : 1) - day; // porta a lunedì
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Ruoli fissi allineati all'enum StaffRole del backend
export const ROLE_OPTIONS = [
  { value: "housekeeping", label: "Housekeeping (pulizie / camere)" },
  { value: "kitchen", label: "Cucina / Colazioni" },
  { value: "reception_day", label: "Reception (giorno)" },
  { value: "reception_night", label: "Reception (notte)" },
  { value: "manager", label: "Manager / Amministratore" },
];

export function getRoleLabel(value) {
  if (!value) return "";
  const opt = ROLE_OPTIONS.find((r) => r.value === value);
  return opt ? opt.label : value;
}

export function getTaskLabel(taskType) {
  if (taskType === "checkin") return "Check-in";
  if (taskType === "checkout") return "Check-out";
  if (taskType === "cleaning") return "Pulizia";
  if (taskType === "breakfast") return "Colazione";
  if (taskType === "maintenance") return "Manutenzione";
  return taskType || "Altro";
}
