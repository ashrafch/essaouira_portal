import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";

function useIsMobile(breakpoint = 1024) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint);

  useEffect(() => {
    function onResize() {
      setIsMobile(window.innerWidth < breakpoint);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);

  return isMobile;
}

function MobileBottomNav() {
  const items = useMemo(
    () => [
      { to: "/", label: "Home" },
      { to: "/operations", label: "Ops" },
      { to: "/bookings", label: "Booking" },
      { to: "/staff", label: "Staff" },
      { to: "/business", label: "Business" },
    ],
    []
  );

  return (
    <nav
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        height: 62,
        borderTop: "1px solid #e2e8f0",
        background: "rgba(255,255,255,0.98)",
        backdropFilter: "blur(6px)",
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        zIndex: 41,
      }}
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          style={({ isActive }) => ({
            display: "grid",
            placeItems: "center",
            fontSize: 11,
            fontWeight: 700,
            color: isActive ? "#0f766e" : "#64748b",
            textDecoration: "none",
            borderTop: isActive ? "2px solid #0f766e" : "2px solid transparent",
          })}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function Layout({ children }) {
  const content = children ?? <Outlet />;
  const isMobile = useIsMobile();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (mobileSidebarOpen && isMobile) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
    document.body.style.overflow = "";
    return undefined;
  }, [isMobile, mobileSidebarOpen]);

  const layoutStyle = {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "280px 1fr",
    gridTemplateRows: "72px 1fr",
    minHeight: "100vh",
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
  };

  const sidebarWrapper = {
    gridRow: "1 / 3",
    gridColumn: "1 / 2",
    borderRight: "1px solid #e2e8f0",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.86) 0%, rgba(248,250,252,0.92) 100%)",
    backdropFilter: "blur(6px)",
    overflowY: "auto",
  };

  const topbarWrapper = {
    gridRow: "1 / 2",
    gridColumn: isMobile ? "1 / 2" : "2 / 3",
    borderBottom: "1px solid #e2e8f0",
    backgroundColor: "rgba(255,255,255,0.86)",
    backdropFilter: "blur(6px)",
    position: "sticky",
    top: 0,
    zIndex: 30,
  };

  const contentWrapper = {
    gridRow: "2 / 3",
    gridColumn: isMobile ? "1 / 2" : "2 / 3",
    padding: isMobile ? "14px 12px 84px" : "24px 26px 30px",
    overflowX: "hidden",
  };

  return (
    <div style={layoutStyle}>
      {!isMobile ? (
        <aside style={sidebarWrapper}>
          <Sidebar />
        </aside>
      ) : null}

      <header style={topbarWrapper}>
        <Topbar isMobile={isMobile} onMenuToggle={() => setMobileSidebarOpen((s) => !s)} />
      </header>

      <main style={contentWrapper}>
        <div style={{ maxWidth: 1480, margin: "0 auto" }}>{content}</div>
      </main>

      {isMobile ? <MobileBottomNav /> : null}

      {isMobile && mobileSidebarOpen ? (
        <>
          <div
            role="button"
            tabIndex={0}
            aria-label="Chiudi menu"
            onClick={() => setMobileSidebarOpen(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                setMobileSidebarOpen(false);
              }
            }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(2,6,23,0.35)",
              zIndex: 42,
            }}
          />
          <aside
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              bottom: 0,
              width: "min(84vw, 320px)",
              zIndex: 43,
              ...sidebarWrapper,
            }}
          >
            <Sidebar onNavigate={() => setMobileSidebarOpen(false)} />
          </aside>
        </>
      ) : null}
    </div>
  );
}

export default Layout;
