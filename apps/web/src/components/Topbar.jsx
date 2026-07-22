import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, Menu, Moon, Sun, Wifi, WifiOff } from "lucide-react";
import { resolveHelp } from "../config/helpTopics";
import { clearAuthSession, getCurrentRole, getCurrentTenant, getCurrentUsername } from "../services/auth";
import { getDashboardSummary } from "../services/api";
import { useTheme } from "../hooks/useTheme";
import CommandPalette from "./CommandPalette";
import HelpButton from "./HelpButton";
import StatusBadge from "./ui/StatusBadge";
import "./chrome.css";

function Topbar({ onToggleSidebar = null }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const pageTopic = resolveHelp(pathname);
  const [online, setOnline] = useState(navigator.onLine);
  const [alertsOpen, setAlertsOpen] = useState(0);
  const { theme, toggleTheme } = useTheme();
  const username = getCurrentUsername() || "Owner";
  const role = getCurrentRole() || "owner";
  const tenant = getCurrentTenant() || "default";

  useEffect(() => {
    function handleOnline() {
      setOnline(true);
    }
    function handleOffline() {
      setOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getDashboardSummary()
      .then((summary) => {
        if (!cancelled && summary?.smart) {
          setAlertsOpen(summary.smart.alerts_open || 0);
        }
      })
      .catch(() => {
        /* non-blocking: the bell simply shows no count */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="topbar">
      <div className="topbar__left">
        {onToggleSidebar ? (
          <button
            type="button"
            className="mobile-menu-btn chrome-icon-btn"
            onClick={onToggleSidebar}
            aria-label="Apri menu di navigazione"
          >
            <Menu size={16} />
          </button>
        ) : null}
        <div>
          <div className="topbar__title">{pageTopic.title}</div>
          <div className="topbar__subtitle">{pageTopic.intro}</div>
        </div>
      </div>

      <div className="topbar__right">
        <CommandPalette />
        <span
          className={`topbar__conn ${online ? "topbar__conn--online" : "topbar__conn--offline"}`}
          role="status"
        >
          {online ? <Wifi size={12} aria-hidden="true" /> : <WifiOff size={12} aria-hidden="true" />}
          {online ? "Online" : "Offline"}
        </span>
        <div className="topbar__meta">
          <StatusBadge status={role} />
          <div className="topbar__user">
            <strong>{username}</strong> · tenant <strong>{tenant}</strong>
          </div>
        </div>
        <div className="topbar__actions">
          <HelpButton />
          <button
            type="button"
            className="chrome-icon-btn topbar__bell"
            onClick={() => navigate("/smart-alerts")}
            aria-label={
              alertsOpen > 0
                ? `${alertsOpen} alert smart aperti`
                : "Nessun alert smart aperto"
            }
            title="Alert smart"
          >
            <Bell size={16} aria-hidden="true" />
            {alertsOpen > 0 ? (
              <span className="topbar__bell-count" aria-hidden="true">
                {alertsOpen > 9 ? "9+" : alertsOpen}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className="chrome-icon-btn"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Attiva tema chiaro" : "Attiva tema scuro"}
            title={theme === "dark" ? "Tema chiaro" : "Tema scuro"}
          >
            {theme === "dark" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="topbar__logout"
            onClick={() => {
              clearAuthSession();
              window.location.href = "/login";
            }}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

export default Topbar;
