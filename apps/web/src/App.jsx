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
import Business from "./pages/Business.jsx";
import ArrivalsDepartures from "./pages/ArrivalsDepartures";
import StaffDirectory from "./pages/StaffDirectory";
import Pricing from "./pages/Pricing";
import BookingDocument from "./pages/BookingDocument";

function App() {
  return (
    <Routes>
      {/* 1. Rotta "STANDALONE" per la stampa (Senza Sidebar/Layout) */}
      <Route 
        path="/bookings/:bookingId/document" 
        element={<BookingDocument />} 
      />

      {/* 2. Tutte le altre rotte "GESTIONALI" (Dentro il Layout) */}
      <Route
        path="*"
        element={
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/operations" element={<ArrivalsDepartures />} />
              <Route path="/units" element={<Units />} />
              <Route path="/units/:unitId/timeline" element={<UnitTimeline />} />
              <Route path="/bookings" element={<Bookings />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/staff" element={<Staff />} />
              <Route path="/staff-planner" element={<StaffPlanner />} />
              <Route path="/business" element={<Business />} />
              <Route path="/staff-anagrafica" element={<StaffDirectory />} />
              <Route path="/tariffe-canali" element={<Pricing />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
        }
      />
    </Routes>
  );
}

export default App;