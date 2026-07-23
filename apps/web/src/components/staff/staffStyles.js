/**
 * Shared inline-style objects for the Staff board and its sub-components.
 * Extracted verbatim from Staff.jsx so every piece renders identically.
 */

export const page = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

export const controlsRow = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 10,
  fontSize: 12,
};

export const card = {
  background: "var(--color-surface)",
  borderRadius: 14,
  padding: 12,
  boxShadow: "var(--shadow-sm)",
  border: "1px solid var(--color-border)",
};

export const sectionTitle = {
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 6,
  color: "var(--color-text)",
};

export const pillStatus = (status) => ({
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

export const boardWrapper = {
  overflowX: "hidden",
  width: "100%",
};

export const board = (colCount) => ({
  minWidth: "100%",
  display: "grid",
  gridTemplateColumns: `130px repeat(${colCount || 1}, minmax(0, 1fr))`,
  borderCollapse: "collapse",
  fontSize: 12,
});

export const boardHeaderCell = {
  padding: "6px 4px",
  borderBottom: "1px solid var(--color-border)",
  fontSize: 11,
  color: "var(--color-text-muted)",
  fontWeight: 500,
  textAlign: "center",
  background: "var(--color-surface-soft)",
};

export const boardDayCell = {
  padding: "6px 4px",
  borderBottom: "1px solid var(--color-border)",
  fontSize: 11,
  color: "var(--color-text)",
  background: "var(--color-surface-soft)",
  fontWeight: 500,
};

export const boardCell = {
  padding: 6,
  borderBottom: "1px solid var(--color-border)",
  borderRight: "1px solid var(--color-border)",
  verticalAlign: "top",
  minWidth: 0,
};

export const miniTaskCard = (status) => ({
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

export const inputInline = {
  width: "100%",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  padding: "4px 6px",
  fontSize: 11,
};

export const tagType = (taskType) => ({
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

export const infoRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 4,
  alignItems: "center",
};

export const layout = {
  display: "grid",
  gridTemplateColumns: "minmax(260px, 320px) 1fr",
  gap: 12,
  alignItems: "flex-start",
};

export const field = {
  marginBottom: 8,
  display: "flex",
  flexDirection: "column",
  gap: 3,
};

export const label = {
  fontSize: 11,
  fontWeight: 500,
  color: "var(--color-text-muted)",
};

export const input = {
  borderRadius: 8,
  border: "1px solid var(--color-border-strong)",
  padding: "6px 8px",
  fontSize: 13,
};

export const select = {
  ...input,
};

export const textarea = {
  ...input,
  minHeight: 60,
  resize: "vertical",
};

export const kpiGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 8,
  marginBottom: 8,
};

export const kpiCard = {
  background: "var(--color-surface-soft)",
  borderRadius: 12,
  padding: "8px 10px",
};

export const tinyLabel = {
  fontSize: 11,
  color: "var(--color-text-muted)",
  marginBottom: 2,
};

export const tinyValue = {
  fontSize: 18,
  fontWeight: 700,
};

export const quickForm = {
  marginTop: 6,
  borderRadius: 10,
  border: "1px dashed var(--color-border-strong)",
  background: "var(--color-surface-soft)",
  padding: 6,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

export const ticketCardStyle = {
  backgroundColor: "var(--color-warning-soft)",
  border: "1px solid var(--color-warning)",
  borderRadius: 8,
  padding: "10px",
  marginBottom: 8,
  fontSize: 12,
};

export const table = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

export const th = {
  textAlign: "left",
  borderBottom: "1px solid var(--color-border)",
  padding: "6px 4px",
  color: "var(--color-text-muted)",
  fontSize: 12,
};

export const td = {
  padding: "6px 4px",
  borderBottom: "1px solid var(--color-border)",
};
