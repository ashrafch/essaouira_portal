function normalizeStatus(status) {
  const value = String(status || "UNKNOWN").toUpperCase();
  if (value === "READY") return "READY";
  if (value === "NEEDS_ATTENTION") return "NEEDS_ATTENTION";
  if (value === "BLOCKED") return "BLOCKED";
  return "UNKNOWN";
}

function ReadinessBadge({ status }) {
  const normalized = normalizeStatus(status);
  return <span className={`readiness-badge readiness-badge--${normalized.toLowerCase()}`}>{normalized}</span>;
}

export default ReadinessBadge;

