import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getUnitSchedule } from "../services/api";

const wrapper = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const card = {
  backgroundColor: "#ffffff",
  borderRadius: 14,
  padding: 16,
  boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
  border: "1px solid #e5e7eb",
};

const input = {
  borderRadius: 8,
  border: "1px solid #d1d5db",
  padding: "6px 8px",
  fontSize: 13,
};

const pill = (kind) => {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 500,
  };
  if (kind === "booking") {
    return { ...base, backgroundColor: "#dcfce7", color: "#166534" };
  }
  return { ...base, backgroundColor: "#e0f2fe", color: "#075985" };
};

function UnitTimeline() {
  const { unitId } = useParams();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      const data = await getUnitSchedule(unitId, params);
      setItems(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, fromDate, toDate]);

  return (
    <div style={wrapper}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ marginBottom: 4 }}>Timeline unità #{unitId}</h1>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Prenotazioni e task staff in ordine cronologico per questo
            appartamento.
          </p>
        </div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          <div style={{ marginBottom: 4 }}>Intervallo date</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="date"
              style={input}
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
            <input
              type="date"
              style={input}
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div style={card}>
        {error && (
          <p style={{ color: "red", fontSize: 12, marginBottom: 8 }}>{error}</p>
        )}
        {loading ? (
          <p style={{ fontSize: 13 }}>Caricamento timeline...</p>
        ) : items.length === 0 ? (
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Nessun evento per questo intervallo.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {items.map((it) => (
              <li
                key={`${it.kind}-${it.id}-${it.start_date}`}
                style={{
                  padding: "8px 0",
                  borderBottom: "1px solid #f3f4f6",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 2,
                  }}
                >
                  <span style={pill(it.kind)}>
                    {it.kind === "booking" ? "Prenotazione" : "Task staff"}
                  </span>
                  <span style={{ fontSize: 11, color: "#6b7280" }}>
                    {new Date(it.start_date).toLocaleDateString("it-IT")}
                    {it.end_date
                      ? " → " +
                        new Date(it.end_date).toLocaleDateString("it-IT")
                      : ""}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {it.title}
                </div>
                {it.notes && (
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                    {it.notes}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default UnitTimeline;
