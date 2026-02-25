import { useEffect, useState } from "react";
import {
  clearAuthSession,
  getCurrentRole,
  getCurrentTenantId,
  getCurrentUsername,
} from "../services/auth";

function Topbar({ isMobile = false, onMenuToggle = null }) {
  const [online, setOnline] = useState(navigator.onLine);
  const username = getCurrentUsername() || "Owner";
  const role = getCurrentRole() || "owner";
  const tenantId = getCurrentTenantId() || "default";

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

  const badge = {
    fontSize: 11,
    padding: "4px 10px",
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };

  const dot = (color) => ({
    width: 8,
    height: 8,
    borderRadius: "999px",
    backgroundColor: color,
  });

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: isMobile ? "0 10px" : "0 22px",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        {isMobile ? (
          <button
            type="button"
            style={{
              fontSize: 18,
              lineHeight: 1,
              width: 36,
              height: 36,
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "white",
              color: "#0f172a",
              padding: 0,
            }}
            onClick={() => onMenuToggle?.()}
            aria-label="Apri menu"
          >
            ≡
          </button>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.01em" }}>
            Operativita Giornaliera
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#64748b",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Controllo live prenotazioni, staff, costi e manutenzione
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
        <div
          style={{
            ...badge,
            backgroundColor: online ? "#ecfdf5" : "#fef2f2",
            color: online ? "#047857" : "#b91c1c",
          }}
        >
          <span style={dot(online ? "#22c55e" : "#ef4444")} />
          {online ? "Online" : "Offline"}
        </div>

        {!isMobile ? (
          <div
            style={{
              fontSize: 12,
              color: "#475569",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 999,
              padding: "5px 10px",
            }}
          >
            <strong>{username}</strong> ({role}) · tenant <strong>{tenantId}</strong>
          </div>
        ) : null}

        <button
          type="button"
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: "5px 10px",
            borderRadius: 999,
            border: "1px solid #d1d5db",
            background: "white",
            color: "#374151",
            cursor: "pointer",
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
