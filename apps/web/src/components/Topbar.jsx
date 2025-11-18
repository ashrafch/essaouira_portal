import { useEffect, useState } from "react";

const wrapper = {
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 24px",
};

function Topbar() {
  const [online, setOnline] = useState(navigator.onLine);

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
    <div style={wrapper}>
      <div style={{ fontWeight: 600, fontSize: "16px" }}>
        Gestione villa & appartamenti
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div
          style={{
            ...badge,
            backgroundColor: online ? "#ecfdf5" : "#fef2f2",
            color: online ? "#047857" : "#b91c1c",
          }}
        >
          <span style={dot(online ? "#22c55e" : "#ef4444")} />
          {online ? "Online" : "Offline (solo cache)"}
        </div>
        <div style={{ fontSize: "13px", color: "#6b7280" }}>
          Logged as <strong>Owner</strong>
        </div>
      </div>
    </div>
  );
}

export default Topbar;
