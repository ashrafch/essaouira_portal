import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";

const layoutStyle = {
  display: "grid",
  gridTemplateColumns: "240px 1fr",
  gridTemplateRows: "60px 1fr",
  minHeight: "100vh",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const sidebarWrapper = {
  gridRow: "1 / 3",
  gridColumn: "1 / 2",
  borderRight: "1px solid #e5e7eb",
  backgroundColor: "#f9fafb",
};

const topbarWrapper = {
  gridRow: "1 / 2",
  gridColumn: "2 / 3",
  borderBottom: "1px solid #e5e7eb",
  backgroundColor: "#ffffff",
};

const contentWrapper = {
  gridRow: "2 / 3",
  gridColumn: "2 / 3",
  padding: "24px",
  backgroundColor: "#f3f4f6",
};

function Layout({ children }) {
  return (
    <div style={layoutStyle}>
      <aside style={sidebarWrapper}>
        <Sidebar />
      </aside>
      <header style={topbarWrapper}>
        <Topbar />
      </header>
      <main style={contentWrapper}>{children}</main>
    </div>
  );
}

export default Layout;
