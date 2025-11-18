import { useEffect, useState } from "react";
import { getHealth, getUnits, getBookings } from "../services/api";
import db from "../offline/dbLocal";

function Dashboard() {
  const [status, setStatus] = useState("caricamento...");
  const [unitsCount, setUnitsCount] = useState(0);
  const [bookingsCount, setBookingsCount] = useState(0);

  const [error, setError] = useState(null);

  useEffect(() => {
    getHealth()
      .then((d) => setStatus(d.status))
      .catch((e) => setStatus("offline"));

    // units
    getUnits()
      .then(async (data) => {
        setUnitsCount(data.length);
        await db.units.clear();
        await db.units.bulkPut(data);
      })
      .catch(async () => {
        const cached = await db.units.toArray();
        setUnitsCount(cached.length);
      });

    // bookings
    getBookings()
      .then(async (data) => {
        setBookingsCount(data.length);
        await db.bookings.clear();
        await db.bookings.bulkPut(data);
      })
      .catch(async (err) => {
        setError(err.message);
        const cached = await db.bookings.toArray();
        setBookingsCount(cached.length);
      });
  }, []);

  const card = {
    backgroundColor: "white",
    borderRadius: "12px",
    padding: "16px 18px",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.06)",
    minWidth: "180px",
  };

  return (
    <div>
      <h1 style={{ marginBottom: 16 }}>Dashboard</h1>

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={card}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Backend</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>
            {status === "ok" ? "Online" : "Offline"}
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Appartamenti</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{unitsCount}</div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Prenotazioni</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{bookingsCount}</div>
        </div>
      </div>

      {error && (
        <p style={{ color: "red", fontSize: 13 }}>
          Errore caricamento dati live, mostrati dati da cache offline.
        </p>
      )}
    </div>
  );
}

export default Dashboard;
