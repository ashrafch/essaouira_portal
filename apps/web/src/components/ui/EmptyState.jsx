import { Inbox } from "lucide-react";
import "./ui.css";

function EmptyState({ title = "Nessun dato", description = "" }) {
  return (
    <div className="ui-empty">
      <Inbox size={20} />
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      {description ? <div style={{ fontSize: 13 }}>{description}</div> : null}
    </div>
  );
}

export default EmptyState;
