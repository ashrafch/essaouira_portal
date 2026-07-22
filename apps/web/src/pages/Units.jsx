import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { getUnits } from "../services/api";
import db from "../offline/dbLocal";
import { PageHeader } from "../components/ui";

function Units() {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await getUnits();
        setUnits(data);
        setFromCache(false);
        await db.units.clear();
        await db.units.bulkPut(data);
      } catch (err) {
        setError(err.message);
        const cached = await db.units.toArray();
        setUnits(cached);
        setFromCache(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalCapacity = useMemo(
    () => units.reduce((sum, u) => sum + (u.capacity || 0), 0),
    [units]
  );

  const pill = {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 999,
    background: "var(--color-info-soft)",
    color: "var(--color-info-strong)",
    border: "1px solid var(--color-info)",
  };

  const grid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
  };

  const card = {
    backgroundColor: "var(--color-surface)",
    borderRadius: "14px",
    padding: "14px 16px",
    boxShadow: "var(--shadow-sm)",
    border: "1px solid var(--color-border)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  };

  const chipRow = {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  };

  const chip = {
    fontSize: 11,
    padding: "3px 8px",
    borderRadius: 999,
    background: "var(--color-surface-soft)",
    color: "var(--color-text-muted)",
  };

  const headerRow = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  };

  const avatar = () => ({
    width: 30,
    height: 30,
    borderRadius: "999px",
    background: "var(--color-success-soft)",
    color: "var(--color-success-strong)",
    fontSize: 14,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });

  const actionsRow = {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  };

  const actionLink = {
    display: "inline-flex",
    alignItems: "center",
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid var(--color-border-strong)",
    textDecoration: "none",
    color: "var(--color-text)",
    backgroundColor: "var(--color-surface)",
  };

  const smartActionLink = {
    ...actionLink,
    borderColor: "var(--color-primary)",
    color: "var(--color-primary)",
  };

  return (
    <div>
      <PageHeader
        title="Appartamenti"
        subtitle="Panoramica delle 6 unità che affacciano sulla piscina della villa."
        actions={
          <div style={{ textAlign: "right", fontSize: 12, color: "var(--color-text-muted)" }}>
            <div style={{ marginBottom: 4 }}>
              Totale capacità: <strong>{totalCapacity}</strong> ospiti
            </div>
            {fromCache && (
              <span style={pill}>
                Offline – dati da cache locale (IndexedDB)
              </span>
            )}
          </div>
        }
      />

      {error && !fromCache && (
        <p style={{ color: "var(--color-danger)", fontSize: 13, marginBottom: 12 }}>
          Errore durante il caricamento: {error}
        </p>
      )}

      {loading ? (
        <p>Caricamento appartamenti...</p>
      ) : units.length === 0 ? (
        <p>Nessuna unità configurata.</p>
      ) : (
        <div style={grid}>
          {units.map((u) => (
            <div key={u.id} style={card}>
              <div style={headerRow}>
                <div style={avatar(u.name?.[0] || "?")}>
                  {u.name?.[0] || "?"}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--color-text-muted)",
                    }}
                  >
                    ID #{u.id}
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>
                  {u.name || "Unità"}
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                  Appartamento vista piscina · ideale per famiglie e gruppi
                </div>
              </div>

              <div style={chipRow}>
                <span style={chip}>
                  {u.size_m2 ? `${u.size_m2} m²` : "Metri quadri n/d"}
                </span>
                <span style={chip}>{u.capacity} ospiti</span>
                <span
                  style={{ ...chip, background: "var(--color-success-soft)", color: "var(--color-success-strong)" }}
                >
                  Attivo
                </span>
              </div>

              <div
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: "var(--color-text-subtle)",
                }}
              >
                In futuro qui possiamo mostrare occupazione annua, ricavi,
                note specifiche dell&apos;unità, ecc.
              </div>

              <div style={actionsRow}>
                <Link
                  to={`/units/${u.id}/timeline`}
                  style={actionLink}
                  aria-label={`Timeline PMS di ${u.name || `unità ${u.id}`}`}
                >
                  Vedi timeline
                </Link>
                <Link
                  to={`/smart-units/${u.id}`}
                  style={smartActionLink}
                  aria-label={`Stato smart e dispositivi di ${u.name || `unità ${u.id}`}`}
                >
                  Stato smart
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Units;
