import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { getUnits } from "../services/api";
import db from "../offline/dbLocal";

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

  const layoutHeader = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 12,
    marginBottom: 20,
    flexWrap: "wrap",
  };

  const pill = {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 999,
    background: "#ecfeff",
    color: "#0f766e",
    border: "1px solid #a5f3fc",
  };

  const grid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
  };

  const card = {
    backgroundColor: "white",
    borderRadius: "14px",
    padding: "14px 16px",
    boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
    border: "1px solid #e5e7eb",
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
    background: "#f3f4f6",
    color: "#4b5563",
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
    background: "#ecfdf5",
    color: "#047857",
    fontSize: 14,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });

  const timelineButton = {
    display: "inline-flex",
    marginTop: 8,
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #d1d5db",
    textDecoration: "none",
    color: "#111827",
    backgroundColor: "#ffffff",
    alignSelf: "flex-start",
  };

  return (
    <div>
      <div style={layoutHeader}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Appartamenti</h1>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Panoramica delle 6 unità che affacciano sulla piscina della villa.
          </p>
        </div>

        <div style={{ textAlign: "right", fontSize: 12, color: "#6b7280" }}>
          <div style={{ marginBottom: 4 }}>
            Totale capacità: <strong>{totalCapacity}</strong> ospiti
          </div>
          {fromCache && (
            <span style={pill}>
              Offline – dati da cache locale (IndexedDB)
            </span>
          )}
        </div>
      </div>

      {error && !fromCache && (
        <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>
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
                      color: "#6b7280",
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
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  Appartamento vista piscina · ideale per famiglie e gruppi
                </div>
              </div>

              <div style={chipRow}>
                <span style={chip}>
                  {u.size_m2 ? `${u.size_m2} m²` : "Metri quadri n/d"}
                </span>
                <span style={chip}>{u.capacity} ospiti</span>
                <span
                  style={{ ...chip, background: "#ecfdf5", color: "#047857" }}
                >
                  Attivo
                </span>
              </div>

              <div
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: "#9ca3af",
                }}
              >
                In futuro qui possiamo mostrare occupazione annua, ricavi,
                note specifiche dell&apos;unità, ecc.
              </div>

              <Link to={`/units/${u.id}/timeline`} style={timelineButton}>
                Vedi timeline
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Units;
