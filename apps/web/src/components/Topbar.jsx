import { useEffect, useState } from "react";
import { Menu, Wifi, WifiOff } from "lucide-react";
import { clearAuthSession, getCurrentRole, getCurrentTenant, getCurrentUsername } from "../services/auth";
import StatusBadge from "./ui/StatusBadge";

function Topbar({ onToggleSidebar = null }) {
  const [online, setOnline] = useState(navigator.onLine);
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

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 18px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {onToggleSidebar ? (
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={onToggleSidebar}
            style={{
              background: "#fff",
              color: "#0f172a",
              border: "1px solid #cbd5e1",
              padding: 8,
            }}
            aria-label="Open menu"
          >
            <Menu size={16} />
          </button>
        ) : null}
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Operativita Giornaliera</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            Controllo live prenotazioni, staff, costi e manutenzione
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            borderRadius: 999,
            padding: "4px 10px",
            fontSize: 12,
            fontWeight: 600,
            background: online ? "#ecfdf5" : "#fef2f2",
            color: online ? "#065f46" : "#991b1b",
            border: `1px solid ${online ? "#a7f3d0" : "#fecaca"}`,
          }}
        >
          {online ? <Wifi size={12} /> : <WifiOff size={12} />}
          {online ? "Online" : "Offline"}
        </span>
        <StatusBadge status={role} />
        <div style={{ fontSize: 13, color: "#64748b" }}>
          <strong>{username}</strong> · tenant <strong>{tenant}</strong>
        </div>
        <button
          type="button"
          style={{
            fontSize: 12,
            borderRadius: 999,
            border: "1px solid #cbd5e1",
            background: "#fff",
            color: "#334155",
          }}
          onClick={() => {
            clearAuthSession();
            window.location.href = "/login";
          }}
        >
          Logout
        </button>
      </div>
    </div>
  );
}

export default Topbar;
