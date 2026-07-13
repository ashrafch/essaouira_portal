import { Link } from "react-router-dom";

function Forbidden() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "var(--color-bg)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 14,
          padding: 20,
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: 8, fontSize: 22 }}>Accesso negato</h1>
        <p style={{ color: "var(--color-text-muted)", marginTop: 0 }}>
          Il tuo ruolo non ha permessi per aprire questa pagina.
        </p>
        <Link to="/" style={{ color: "var(--color-primary)", fontWeight: 600 }}>
          Torna alla dashboard
        </Link>
      </div>
    </div>
  );
}

export default Forbidden;
