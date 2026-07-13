import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Activity,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Cpu,
  Eye,
  Gauge,
  Home,
  IdCard,
  LayoutDashboard,
  LogIn,
  LogOut,
  Receipt,
  Router,
  Settings,
  ShieldCheck,
  Siren,
  Tags,
  TrendingUp,
  Users,
  Wand2,
  Wrench,
  ArrowRightLeft,
  Workflow,
} from "lucide-react";
import { canAccessRoute, getRole } from "../config/rbac";
import { getDashboardSummary } from "../services/api";
import "./chrome.css";

function makeLinkClass(level) {
  return ({ isActive }) =>
    [
      "sidebar__link",
      level === "sub" ? "sidebar__link--sub" : "",
      isActive ? "is-active" : "",
    ]
      .filter(Boolean)
      .join(" ");
}

const topLinkClass = makeLinkClass("top");
const subLinkClass = makeLinkClass("sub");

function Sidebar({ className = "", onNavigate = null }) {
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

  const sections = [
    {
      id: "bookings",
      title: "Prenotazioni",
      icon: CalendarRange,
      items: [
        { to: "/calendar", label: "Calendario", badge: "staysToday", routeKey: "calendar", icon: CalendarDays },
        { to: "/bookings", label: "Lista prenotazioni", badge: null, routeKey: "bookings", icon: ClipboardList },
        {
          to: "/operations",
          label: "Arrivi & Partenze",
          badge: "arrivalsDepartures",
          routeKey: "operations",
          icon: ArrowRightLeft,
        },
      ],
    },
    {
      id: "property",
      title: "Proprietà",
      icon: Building2,
      items: [
        { to: "/units", label: "Appartamenti", badge: null, routeKey: "units", icon: Home },
        { to: "/properties", label: "Properties", badge: null, routeKey: "properties", icon: Building2 },
        { to: "/tariffe-canali", label: "Tariffe & Canali", badge: null, routeKey: "pricing", icon: Tags },
        { to: "/expenses", label: "Spese Generali", badge: null, routeKey: "expenses", icon: Receipt },
        {
          to: "/business",
          label: "Business (Ricavi & Costi)",
          badge: null,
          routeKey: "business",
          icon: TrendingUp,
        },
      ],
    },
    {
      id: "staff",
      title: "Operations & Staff",
      icon: Users,
      items: [
        {
          to: "/staff-planner",
          label: "Planner staff",
          badge: "staffTasksToday",
          routeKey: "staffPlanner",
          icon: CalendarClock,
        },
        {
          to: "/staff",
          label: "Task staff & pulizie",
          badge: "staffTasksToday",
          routeKey: "staff",
          icon: ClipboardCheck,
        },
        {
          to: "/staff-anagrafica",
          label: "Anagrafica staff",
          badge: null,
          routeKey: "staffDirectory",
          icon: IdCard,
        },
      ],
    },
    {
      id: "facility",
      title: "Facility",
      icon: Wrench,
      items: [
        {
          to: "/maintenance",
          label: "Manutenzioni",
          badge: "openTickets",
          routeKey: "maintenance",
          icon: Wrench,
        },
      ],
    },
    {
      id: "smart",
      title: "Smart Building",
      icon: Cpu,
      items: [
        { to: "/smart-dashboard", label: "Smart dashboard", badge: null, routeKey: "smartDashboard", icon: Gauge },
        { to: "/smart-operations", label: "Smart operations", badge: null, routeKey: "smartOperations", icon: Activity },
        { to: "/smart-overview", label: "Smart overview", badge: null, routeKey: "smartOverview", icon: Eye },
        { to: "/smart-devices", label: "Dispositivi", badge: null, routeKey: "smartDevices", icon: Router },
        { to: "/smart-alerts", label: "Alert smart", badge: null, routeKey: "smartAlerts", icon: Siren },
        { to: "/smart-automation", label: "Automazioni smart", badge: null, routeKey: "smartAutomation", icon: Workflow },
        { to: "/smart-assistant/checkin", label: "Assistant check-in", badge: null, routeKey: "smartCheckinAssistant", icon: LogIn },
        { to: "/smart-assistant/checkout", label: "Assistant checkout", badge: null, routeKey: "smartCheckoutAssistant", icon: LogOut },
      ],
    },
    {
      id: "admin",
      title: "Admin",
      icon: Settings,
      items: [
        { to: "/setup", label: "Setup Wizard", badge: null, routeKey: "setupWizard", icon: Wand2 },
        { to: "/admin-control", label: "Admin & Config", badge: null, routeKey: "adminControl", icon: ShieldCheck },
      ],
    },
  ];
  const routeFilteredSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canAccessRoute(item.routeKey, role)),
    }))
    .filter((section) => section.items.length > 0);

  // Badge counts: one lightweight call to the server-side summary, instead of
  // fetching all bookings + tasks + tickets and counting client-side on every
  // navigation. Refreshes when the route changes.
  useEffect(() => {
    let cancelled = false;
    async function loadStats() {
      try {
        const summary = await getDashboardSummary();
        if (cancelled || !summary) return;
        setTodayStats({
          arrivals: summary.arrivals_today || 0,
          departures: summary.departures_today || 0,
          stays: summary.in_house || 0,
          staffTasks: summary.staff_tasks_today || 0,
          openTickets: summary.maintenance_open || 0,
        });
      } catch (err) {
        console.error("Errore caricando badge sidebar:", err);
      }
    }
    loadStats();
    return () => {
      cancelled = true;
    };
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
        <span className="sidebar__badge">
          {arrivals}/{departures}
        </span>
      );
    }

    if (type === "staysToday") {
      const { stays } = todayStats;
      if (!stays) return null;
      return <span className="sidebar__badge">{stays}</span>;
    }

    if (type === "staffTasksToday") {
      const { staffTasks } = todayStats;
      if (!staffTasks) return null;
      return <span className="sidebar__badge">{staffTasks}</span>;
    }

    if (type === "openTickets") {
      const { openTickets } = todayStats;
      if (!openTickets) return null;
      // Rosso per i problemi aperti
      return <span className="sidebar__badge sidebar__badge--danger">{openTickets}</span>;
    }

    return null;
  }

  return (
    <div className={`sidebar ${className}`.trim()}>
      <div className="sidebar__brand-block">
        <div className="sidebar__brand-row">
          <span className="sidebar__brand-mark" aria-hidden="true">
            E
            <span className="sidebar__brand-mark-dot" />
          </span>
          <div className="sidebar__brand-text">
            <div className="sidebar__brand">Portale Essaouira</div>
            <div className="sidebar__brand-sub">Gestione villa & appartamenti</div>
          </div>
        </div>
      </div>

      <nav className="sidebar__nav" aria-label="Navigazione principale">
        {/* DASHBOARD SINGOLA */}
        <NavLink
          to="/"
          end
          className={topLinkClass}
          onClick={() => {
            if (onNavigate) onNavigate();
          }}
        >
          <span className="sidebar__link-content">
            <LayoutDashboard size={15} className="sidebar__link-icon" aria-hidden="true" />
            <span>Dashboard</span>
          </span>
        </NavLink>

        {/* SEZIONI COLLASSABILI */}
        {routeFilteredSections.map((section) => {
          const isOpen = Boolean(openSections[section.id]);
          const path = location.pathname;
          const hasActiveChild = section.items.some((item) =>
            path.startsWith(item.to)
          );
          const SectionIcon = section.icon;

          return (
            <div key={section.id} className="sidebar__section">
              <button
                type="button"
                className={`sidebar__section-toggle ${hasActiveChild ? "is-active" : ""}`.trim()}
                aria-expanded={isOpen}
                aria-controls={`sidebar-section-${section.id}`}
                onClick={() => toggleSection(section.id)}
              >
                <span className="sidebar__section-left">
                  {SectionIcon ? (
                    <SectionIcon size={15} className="sidebar__section-icon" aria-hidden="true" />
                  ) : null}
                  <span className="sidebar__section-title">{section.title}</span>
                </span>
                <span className="sidebar__section-caret" aria-hidden="true">
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
              </button>

              {isOpen && (
                <div className="sidebar__sublinks" id={`sidebar-section-${section.id}`}>
                  {section.items.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={subLinkClass}
                        onClick={() => {
                          if (onNavigate) onNavigate();
                        }}
                      >
                        <span className="sidebar__link-content">
                          {ItemIcon ? (
                            <ItemIcon size={14} className="sidebar__link-icon" aria-hidden="true" />
                          ) : null}
                          <span>{item.label}</span>
                        </span>
                        {renderBadge(item.badge)}
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar__footer">
        <div>{role} dashboard</div>
        <div>v1.0 · local dev</div>
      </div>
    </div>
  );
}

export default Sidebar;
