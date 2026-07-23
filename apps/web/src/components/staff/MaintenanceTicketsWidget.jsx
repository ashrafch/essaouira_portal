import { card, sectionTitle, ticketCardStyle } from "./staffStyles";

/**
 * Left-column widget listing open maintenance tickets (status !== "done").
 * Read-only summary; parent owns the ticket data.
 */
function MaintenanceTicketsWidget({ openTickets, unitMap, staffMembers }) {
  return (
    <div style={card}>
      <div style={sectionTitle}>🔧 Segnalazioni Aperte ({openTickets.length})</div>
      {openTickets.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          Nessuna manutenzione pendente.
        </p>
      ) : (
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          {openTickets.map((t) => (
            <div key={t.id} style={ticketCardStyle}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{t.title}</div>
              <div style={{ color: "var(--color-text-muted)", marginBottom: 4 }}>
                {t.unit_id
                  ? unitMap[t.unit_id]?.name || `Unit #${t.unit_id}`
                  : "Struttura"}{" "}
                · {t.priority}
              </div>
              {t.assigned_to_id && (
                <div style={{ color: "var(--color-success)" }}>
                  Assegnato a:{" "}
                  {staffMembers.find((s) => s.id === t.assigned_to_id)?.name ||
                    "?"}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MaintenanceTicketsWidget;
