import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { canAccessRoute, getRole } from "../config/rbac";
import { getBookings, getStaffTasks, getMaintenanceTickets } from "../services/api";

const wrapper = {
  padding: "20px 16px",
  display: "flex",
  flexDirection: "column",
  height: "100%",
  backgroundColor: "#f9fafb",
};

const brand = {
  fontSize: "20px",
  fontWeight: 700,
  marginBottom: "16px",
  color: "#111827",
};

const brandSub = {
  fontSize: "11px",
  color: "#6b7280",
  marginBottom: "16px",
};

const navContainer = {
  flex: 1,
  overflowY: "auto",
  paddingRight: "4px",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
};

const linkBase = {
  padding: "8px 12px",
  borderRadius: "8px",
  textDecoration: "none",
  fontSize: "14px",
  fontWeight: 500,
  color: "#374151",
  border: "1px solid transparent",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 6,
};

const sectionContainer = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
};

const sectionHeaderButtonBase = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  padding: "6px 10px",
  borderRadius: "8px",
  border: "none",
  background: "transparent",
  cursor: "pointer",
};

const sectionHeaderLeft = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const sectionTitle = {
  fontSize: "11px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const caret = {
  fontSize: "11px",
};

const subLinksWrapper = {
  marginTop: "4px",
  display: "flex",
  flexDirection: "column",
  gap: "2px",
};

const footer = {
  marginTop: "16px",
  fontSize: "11px",
  color: "#9ca3af",
  borderTop: "1px solid #e5e7eb",
  paddingTop: "10px",
};

const badgePill = {
  fontSize: 11,
  padding: "2px 6px",
  borderRadius: 999,
  backgroundColor: "#e5e7eb",
  color: "#111827",
  minWidth: 26,
  textAlign: "center",
};

function makeLinkStyle({ level }) {
  const paddingLeft = level === "top" ? "12px" : "26px";
  const fontSize = level === "top" ? "14px" : "13px";

  return ({ isActive }) => ({
    ...linkBase,
    paddingLeft,
    fontSize,
    backgroundColor: isActive ? "#0f766e" : "transparent",
    color: isActive ? "#ffffff" : "#374151",
    borderColor: isActive ? "#0f766e" : "transparent",
    boxShadow: isActive
      ? "0 1px 2px rgba(15,23,42,0.15)"
      : "none",
  });
}

function Sidebar() {
  const location = useLocation();
  const role = getRole();
  const [openSections, setOpenSections] = useState({
    bookings: false,
    property: false,
    staff: false,
    facility: true, // Apro la nuova sezione per evidenziarla
    smart: true,
  });

  const [todayStats, setTodayStats] = useState({
    arrivals: 0,
    departures: 0,
    stays: 0,
    staffTasks: 0,
    openTickets: 0,
  });

  const topLinkStyle = makeLinkStyle({ level: "top" });
  const subLinkStyle = makeLinkStyle({ level: "sub" });

  const sections = [
    {
      id: "bookings",
      title: "Prenotazioni",
      items: [
        { to: "/calendar", label: "Calendario", badge: "staysToday", routeKey: "calendar" },
        { to: "/bookings", label: "Lista prenotazioni", badge: null, routeKey: "bookings" },
        {
          to: "/operations",
          label: "Arrivi & Partenze",
          badge: "arrivalsDepartures",
          routeKey: "operations",
        },
      ],
    },
    {
      id: "property",
      title: "Proprietà",
      items: [
        { to: "/units", label: "Appartamenti", badge: null, routeKey: "units" },
        { to: "/tariffe-canali", label: "Tariffe & Canali", badge: null, routeKey: "pricing" },
        { to: "/expenses", label: "Spese Generali", badge: null, routeKey: "expenses" },
        {
          to: "/business",
          label: "Business (Ricavi & Costi)",
          badge: null,
          routeKey: "business",
        },
      ],
    },
    {
      id: "staff",
      title: "Operations & Staff",
      items: [
        {
          to: "/staff-planner",
          label: "Planner staff",
          badge: "staffTasksToday",
          routeKey: "staffPlanner",
        },
        {
          to: "/staff",
          label: "Task staff & pulizie",
          badge: "staffTasksToday",
          routeKey: "staff",
        },
        {
          to: "/staff-anagrafica",
          label: "Anagrafica staff",
          badge: null,
          routeKey: "staffDirectory",
        },
      ],
    },
    {
      id: "facility",
      title: "Facility",
      items: [
        {
          to: "/maintenance",
          label: "Manutenzioni",
          badge: "openTickets",
          routeKey: "maintenance",
        },
      ],
    },
    {
      id: "smart",
      title: "Smart Building",
      items: [
        { to: "/smart-overview", label: "Smart overview", badge: null, routeKey: "smartOverview" },
        { to: "/smart-devices", label: "Dispositivi", badge: null, routeKey: "smartDevices" },
        { to: "/smart-alerts", label: "Alert smart", badge: null, routeKey: "smartAlerts" },
        { to: "/smart-automation", label: "Automazioni smart", badge: null, routeKey: "smartAutomation" },
      ],
    },
    {
      id: "admin",
      title: "Admin",
      items: [{ to: "/admin-control", label: "Admin & Config", badge: null, routeKey: "adminControl" }],
    },
  ];
  const routeFilteredSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canAccessRoute(item.routeKey, role)),
    }))
    .filter((section) => section.items.length > 0);

  // carico badge ogni volta che cambio pagina
  useEffect(() => {
    async function loadStats() {
      try {
        const todayStr = new Date().toISOString().slice(0, 10);

        let maintenanceCount = 0;
        try {
            // Recupera i ticket per il badge
            const tickets = await getMaintenanceTickets();
            // Conta solo quelli aperti (todo o in_progress)
            if (Array.isArray(tickets)) {
              maintenanceCount = tickets.filter(t => t.status !== 'done').length;
            }
        } catch {
            // Ignora errori se la tabella non esiste ancora
            console.log("Tabella maintenance forse non pronta");
        }

        const [bookings, tasksToday] = await Promise.all([
          getBookings(),
          getStaffTasks({ date: todayStr }),
        ]);

        let arrivals = 0;
        let departures = 0;
        let stays = 0;

        for (const b of bookings || []) {
          const checkin = b.checkin_date;
          const checkout = b.checkout_date;

          if (checkin === todayStr) arrivals += 1;
          if (checkout === todayStr) departures += 1;

          if (checkin <= todayStr && checkout > todayStr) {
            stays += 1;
          }
        }

        setTodayStats({
          arrivals,
          departures,
          stays,
          staffTasks: (tasksToday || []).length,
          openTickets: maintenanceCount,
        });
      } catch (err) {
        console.error("Errore caricando badge sidebar:", err);
      }
    }

    loadStats();
  }, [location.pathname]);

  // apre le sezioni che contengono la route corrente
  useEffect(() => {
    const path = location.pathname;
    setOpenSections((prev) => {
      const next = { ...prev };
      for (const section of routeFilteredSections) {
        if (section.items.some((item) => path.startsWith(item.to))) {
          next[section.id] = true;
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, role]);

  function toggleSection(id) {
    setOpenSections((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  function renderBadge(type) {
    if (!type) return null;

    if (type === "arrivalsDepartures") {
      const { arrivals, departures } = todayStats;
      if (!arrivals && !departures) return null;
      return (
        <span style={badgePill}>
          {arrivals}/{departures}
        </span>
      );
    }

    if (type === "staysToday") {
      const { stays } = todayStats;
      if (!stays) return null;
      return <span style={badgePill}>{stays}</span>;
    }

    if (type === "staffTasksToday") {
      const { staffTasks } = todayStats;
      if (!staffTasks) return null;
      return <span style={badgePill}>{staffTasks}</span>;
    }

    if (type === "openTickets") {
        const { openTickets } = todayStats;
        if (!openTickets) return null;
        // Rosso per i problemi aperti
        return <span style={{...badgePill, backgroundColor: "#fee2e2", color: "#b91c1c"}}>{openTickets}</span>;
    }

    return null;
  }

  return (
    <div style={wrapper}>
      <div>
        <div style={brand}>Portale Essaouira</div>
        <div style={brandSub}>Gestione villa & appartamenti</div>
      </div>

      <div style={navContainer}>
        {/* DASHBOARD SINGOLA */}
        <NavLink to="/" end style={topLinkStyle}>
          <span>Dashboard</span>
        </NavLink>

        {/* SEZIONI COLLASSABILI */}
        {routeFilteredSections.map((section) => {
          const isOpen = openSections[section.id];
          const path = location.pathname;
          const hasActiveChild = section.items.some((item) =>
            path.startsWith(item.to)
          );

          const headerStyle = {
            ...sectionHeaderButtonBase,
            backgroundColor: hasActiveChild ? "#e0f2fe" : "transparent",
          };

          const titleStyle = {
            ...sectionTitle,
            color: hasActiveChild ? "#0f172a" : "#6b7280",
          };

          return (
            <div key={section.id} style={sectionContainer}>
              <button
                type="button"
                style={headerStyle}
                onClick={() => toggleSection(section.id)}
              >
                <div style={sectionHeaderLeft}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "999px",
                      backgroundColor: hasActiveChild
                        ? "#0f766e"
                        : "#cbd5f5",
                    }}
                  />
                  <span style={titleStyle}>{section.title}</span>
                </div>
                <span style={caret}>{isOpen ? "▾" : "▸"}</span>
              </button>

              {isOpen && (
                <div style={subLinksWrapper}>
                  {section.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      style={subLinkStyle}
                    >
                      <span>{item.label}</span>
                      {renderBadge(item.badge)}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={footer}>
        <div>{role} dashboard</div>
        <div>v0.1 · local dev</div>
      </div>
    </div>
  );
}

export default Sidebar;
