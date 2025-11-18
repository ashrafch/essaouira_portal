import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Units from "./pages/Units.jsx";
import Bookings from "./pages/Bookings.jsx";
import Calendar from "./pages/Calendar.jsx";
import Staff from "./pages/Staff.jsx";
import StaffPlanner from "./pages/StaffPlanner.jsx";
import UnitTimeline from "./pages/UnitTimeline.jsx";
import NotFound from "./pages/NotFound.jsx";

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/units" element={<Units />} />
        <Route path="/units/:unitId/timeline" element={<UnitTimeline />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/staff" element={<Staff />} />
        <Route path="/staff-planner" element={<StaffPlanner />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}

export default App;
