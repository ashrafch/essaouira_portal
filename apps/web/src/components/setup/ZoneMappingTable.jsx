import { Building2, Home, Wrench } from "lucide-react";
import { EmptyState } from "../ui";

const KIND_META = {
  unit: {
    label: "Unità affittabile",
    icon: Home,
    hint: "Va collegata a un'unità del PMS: prenotazioni, readiness e workflow.",
  },
  facility: {
    label: "Impianto condiviso",
    icon: Wrench,
    hint: "Non si collega a un'unità: vive nella pagina Impianti e aree comuni.",
  },
  common: {
    label: "Servizio di sito",
    icon: Building2,
    hint: "Helper globali dell'edificio, visibili a livello di proprietà.",
  },
};

const TH = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid var(--color-border)",
  color: "var(--color-text-muted)",
  fontWeight: 600,
  fontSize: 12,
};
const TD = { padding: "8px 10px", borderBottom: "1px solid var(--color-border)", fontSize: 13 };

/**
 * The mapping step: one row per zone discovered in the building.
 *
 * This is what replaced assigning devices one by one. A zone is a whole part of
 * the building (`a1`, `villa`, `pool`), so binding it once attaches all of its
 * devices at the right place — and makes it obvious when two zones would land on
 * the same unit.
 */
function ZoneMappingTable({ zones, units, value, onChange }) {
  if (!zones?.length) {
    return (
      <EmptyState
        title="Nessuna zona rilevata"
        description="Esegui prima il passo di importazione dispositivi."
      />
    );
  }

  const unitZones = zones.filter((zone) => zone.kind === "unit");
  const otherZones = zones.filter((zone) => zone.kind !== "unit");

  // Two zones on one unit would silently merge two apartments into one.
  const usage = {};
  unitZones.forEach((zone) => {
    const unitId = value[zone.zone];
    if (unitId) usage[unitId] = (usage[unitId] || 0) + 1;
  });

  return (
    <>
      <div style={{ overflowX: "auto" }}>
        <table
          className="ui-table-cards"
          style={{ width: "100%", borderCollapse: "collapse" }}
        >
          <thead>
            <tr>
              <th style={TH}>Zona nell&apos;edificio</th>
              <th style={TH}>Tipo</th>
              <th style={TH}>Dispositivi</th>
              <th style={TH}>Unità del PMS</th>
            </tr>
          </thead>
          <tbody>
            {unitZones.map((zone) => {
              const meta = KIND_META[zone.kind] || KIND_META.facility;
              const Icon = meta.icon;
              const selected = value[zone.zone] || "";
              const duplicated = selected && usage[selected] > 1;
              return (
                <tr key={zone.zone}>
                  <td style={TD} data-label="Zona">
                    <code style={{ fontWeight: 700 }}>{zone.zone}</code>
                    <div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                      {zone.display_name}
                    </div>
                  </td>
                  <td style={TD} data-label="Tipo">
                    <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                      <Icon size={13} /> {meta.label}
                    </span>
                  </td>
                  <td style={TD} data-label="Dispositivi">
                    {zone.device_count}
                    {zone.bound_device_count ? (
                      <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                        {" "}
                        ({zone.bound_device_count} già collegati)
                      </span>
                    ) : null}
                  </td>
                  <td style={TD} data-label="Unità">
                    <select
                      value={selected}
                      onChange={(event) => onChange(zone.zone, event.target.value)}
                      aria-label={`Unità per la zona ${zone.zone}`}
                      style={duplicated ? { borderColor: "var(--color-danger)" } : undefined}
                    >
                      <option value="">— non collegata —</option>
                      {units.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name}
                        </option>
                      ))}
                    </select>
                    {duplicated ? (
                      <div style={{ color: "var(--color-danger-strong)", fontSize: 12 }}>
                        Questa unità è già usata da un&apos;altra zona.
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {otherZones.length ? (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "0 0 6px" }}>
            Rilevate anche queste zone, che <strong>non</strong> si collegano a un&apos;unità:
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {otherZones.map((zone) => {
              const meta = KIND_META[zone.kind] || KIND_META.facility;
              const Icon = meta.icon;
              return (
                <span
                  key={zone.zone}
                  title={meta.hint}
                  style={{
                    display: "inline-flex",
                    gap: 5,
                    alignItems: "center",
                    border: "1px solid var(--color-border)",
                    borderRadius: 999,
                    padding: "3px 10px",
                    fontSize: 12,
                    background: "var(--color-surface-soft)",
                  }}
                >
                  <Icon size={12} />
                  {zone.display_name} · {zone.device_count} dispositivi
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  );
}

export default ZoneMappingTable;
