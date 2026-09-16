export function readWorkflowContext(location) {
  const params = new URLSearchParams(location.search);
  const state = location.state || {};
  const value = (key, queryKey) => state[key] ?? params.get(queryKey);
  const id = (raw) => /^\d+$/.test(String(raw)) && Number(raw) > 0 ? String(raw) : "";
  const rawDate = value("date", "date");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate || "") && !Number.isNaN(Date.parse(rawDate))
    && new Date(rawDate).toISOString().slice(0, 10) === rawDate ? rawDate : "";
  return {
    date,
    unitId: id(value("unitId", "unit_id")),
    bookingId: id(value("bookingId", "booking_id")),
    taskType: value("taskType", "task_type") || "",
  };
}
