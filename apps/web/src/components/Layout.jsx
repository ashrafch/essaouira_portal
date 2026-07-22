import { AnimatePresence, motion } from "framer-motion";
import { Outlet, useLocation } from "react-router-dom";
import { useState } from "react";
import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";
import BottomNav from "./BottomNav.jsx";

const MotionDiv = motion.div;

function Layout({ children }) {
  const content = children ?? <Outlet />;
  const location = useLocation();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="portal-layout">
      <a href="#main-content" className="skip-link">Salta al contenuto</a>

      <aside className="portal-sidebar desktop-only">
        <Sidebar />
      </aside>

      <AnimatePresence>
        {mobileSidebarOpen ? (
          <MotionDiv
            className="mobile-sidebar-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileSidebarOpen(false)}
          >
            <MotionDiv
              className="mobile-sidebar-panel"
              initial={{ x: -24, opacity: 0.6 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -24, opacity: 0.6 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <Sidebar onNavigate={() => setMobileSidebarOpen(false)} />
            </MotionDiv>
          </MotionDiv>
        ) : null}
      </AnimatePresence>

      <header className="portal-topbar">
        <Topbar onToggleSidebar={() => setMobileSidebarOpen(true)} />
      </header>

      <main className="portal-main" id="main-content" tabIndex={-1}>
        <AnimatePresence mode="wait">
          <MotionDiv
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            style={{ height: "100%" }}
          >
            {content}
          </MotionDiv>
        </AnimatePresence>
      </main>

      <BottomNav onOpenMenu={() => setMobileSidebarOpen(true)} />
    </div>
  );
}

export default Layout;
