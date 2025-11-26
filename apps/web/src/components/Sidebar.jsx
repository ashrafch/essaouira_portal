import { NavLink } from "react-router-dom";

const wrapper = {
  padding: "20px 16px",
  display: "flex",
  flexDirection: "column",
  height: "100%",
};

const brand = {
  fontSize: "20px",
  fontWeight: 700,
  marginBottom: "24px",
};

const nav = {
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};

const linkBase = {
  padding: "8px 12px",
  borderRadius: "8px",
  textDecoration: "none",
  fontSize: "14px",
  fontWeight: 500,
  color: "#374151",
  display: "block",
};

const sectionContainer = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
};

const sectionTitle = {
  fontSize: "11px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#6b7280",
  padding: "0 4px",
};

// helper per generare lo stile dei link in base al livello (top vs submenu)
function makeLinkStyle({ level }) {
  const paddingLeft = level === "top" ? "12px" : "20px";
  const fontSize = level === "top" ? "14px" : "13px";

  return ({ isActive }) => ({
    ...linkBase,
    paddingLeft,
    fontSize,
    backgroundColor: isActive ? "#0f766e" : "transparent",
    color: isActive ? "#ffffff" : "#374151",
  });
}

function Sidebar() {
  const topLinkStyle = makeLinkStyle({ level: "top" });
  const subLinkStyle = makeLinkStyle({ level: "sub" });

  return (
    <div style={wrapper}>
      <div style={brand}>Portale Essaouira</div>

      <nav style={nav}>
        {/* TOP LEVEL */}
        <NavLink to="/" end style={topLinkStyle}>
          Dashboard
        </NavLink>

        {/* PRENOTAZIONI */}
        <div style={sectionContainer}>
          <div style={sectionTitle}>Prenotazioni</div>
          <NavLink to="/calendar" style={subLinkStyle}>
            Calendario
          </NavLink>
          <NavLink to="/bookings" style={subLinkStyle}>
            Lista prenotazioni
          </NavLink>
          <NavLink to="/operations" style={subLinkStyle}>
            Arrivi &amp; Partenze
          </NavLink>
        </div>

        {/* PROPRIETÀ */}
        <div style={sectionContainer}>
          <div style={sectionTitle}>Proprietà</div>
          <NavLink to="/units" style={subLinkStyle}>
            Appartamenti
          </NavLink>
          <NavLink to="/tariffe-canali" style={subLinkStyle}>
            Tariffe &amp; Canali
          </NavLink>
          <NavLink to="/business" style={subLinkStyle}>
            Business (Ricavi &amp; Costi)
          </NavLink>
        </div>

        {/* OPERATIONS & STAFF */}
        <div style={sectionContainer}>
          <div style={sectionTitle}>Operations &amp; Staff</div>
          <NavLink to="/staff-planner" style={subLinkStyle}>
            Planner staff
          </NavLink>
          <NavLink to="/staff" style={subLinkStyle}>
            Task staff &amp; pulizie
          </NavLink>
          <NavLink to="/staff-anagrafica" style={subLinkStyle}>
            Anagrafica staff
          </NavLink>
        </div>
      </nav>
    </div>
  );
}

export default Sidebar;
