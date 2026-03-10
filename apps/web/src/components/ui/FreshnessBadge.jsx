import StatusBadge from "./StatusBadge";

function FreshnessBadge({ status }) {
  const normalized = String(status || "stale").toLowerCase();
  if (normalized === "fresh") {
    return <StatusBadge status="healthy" />;
  }
  if (normalized === "stale") {
    return <StatusBadge status="warning" />;
  }
  return <StatusBadge status="offline" />;
}

export default FreshnessBadge;
