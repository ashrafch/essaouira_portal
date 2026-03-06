import { Link } from "react-router-dom";

function Forbidden() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#f3f4f6",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 20,
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: 8, fontSize: 22 }}>Accesso negato</h1>
        <p style={{ color: "#6b7280", marginTop: 0 }}>
          Il tuo ruolo non ha permessi per aprire questa pagina.
        </p>
        <Link to="/" style={{ color: "#0f766e", fontWeight: 600 }}>
          Torna alla dashboard
        </Link>
      </div>
    </div>
  );
}

export default Forbidden;
