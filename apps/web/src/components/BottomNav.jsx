import { NavLink } from "react-router-dom";
import { CalendarDays, CalendarRange, LayoutDashboard, Menu, Users } from "lucide-react";
import { canAccessRoute, getRole } from "../config/rbac";

// Primary phone destinations; the rest live behind "Menu" (opens the drawer).
const ITEMS = [
  { to: "/", key: "dashboard", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/bookings", key: "bookings", label: "Prenot.", icon: CalendarDays },
  { to: "/calendar", key: "calendar", label: "Calend.", icon: CalendarRange },
  { to: "/staff", key: "staff", label: "Staff", icon: Users },
];

/**
 * Mobile-only bottom navigation (shown ≤768px via chrome.css). RBAC-aware; the
 * "Menu" button opens the full sidebar drawer for everything else.
 */
export default function BottomNav({ onOpenMenu }) {
  const role = getRole();
  const items = ITEMS.filter((it) => canAccessRoute(it.key, role));

  return (
    <nav className="bottom-nav" aria-label="Navigazione rapida">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <NavLink
            key={it.key}
            to={it.to}
            end={it.end}
            className={({ isActive }) => `bottom-nav__item${isActive ? " is-active" : ""}`}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{it.label}</span>
          </NavLink>
        );
      })}
      <button
        type="button"
        className="bottom-nav__item bottom-nav__menu"
        onClick={onOpenMenu}
        aria-label="Apri menu completo"
      >
        <Menu size={20} aria-hidden="true" />
        <span>Menu</span>
      </button>
    </nav>
  );
}
