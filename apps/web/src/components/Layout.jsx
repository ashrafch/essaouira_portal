import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";

const layoutStyle = {
  display: "grid",
  gridTemplateColumns: "280px 1fr",
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
};

const topbarWrapper = {
  gridRow: "1 / 2",
  gridColumn: "2 / 3",
  borderBottom: "1px solid #e2e8f0",
  backgroundColor: "rgba(255,255,255,0.86)",
  backdropFilter: "blur(6px)",
};

const contentWrapper = {
  gridRow: "2 / 3",
  gridColumn: "2 / 3",
  padding: "24px 26px 30px",
  overflowX: "hidden",
};

function Layout({ children }) {
  const content = children ?? <Outlet />;

  return (
    <div style={layoutStyle}>
      <aside style={sidebarWrapper}>
        <Sidebar />
      </aside>
      <header style={topbarWrapper}>
        <Topbar />
      </header>
      <main style={contentWrapper}>
        <div style={{ maxWidth: 1480, margin: "0 auto" }}>{content}</div>
      </main>
    </div>
  );
}

export default Layout;
