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
  gap: "8px",
};

const linkBase = {
  padding: "10px 12px",
  borderRadius: "8px",
  textDecoration: "none",
  fontSize: "14px",
  fontWeight: 500,
  color: "#374151",
};

function Sidebar() {
  const linkStyle = ({ isActive }) => ({
    ...linkBase,
    backgroundColor: isActive ? "#0f766e" : "transparent",
    color: isActive ? "white" : "#374151",
  });

  return (
    <div style={wrapper}>
      <div style={brand}>Portale Essaouira</div>
      <nav style={nav}>
        <NavLink to="/" end style={linkStyle}>
          Dashboard
        </NavLink>

        <NavLink to="/units" style={linkStyle}>
          Appartamenti
        </NavLink>

        <NavLink to="/bookings" style={linkStyle}>
          Prenotazioni
        </NavLink>

        <NavLink to="/calendar" style={linkStyle}>
          Calendario
        </NavLink>
      </nav>
    </div>
  );
}

export default Sidebar;
