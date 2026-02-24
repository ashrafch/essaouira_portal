import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";

const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const Units = lazy(() => import("./pages/Units.jsx"));
const Bookings = lazy(() => import("./pages/Bookings.jsx"));
const Calendar = lazy(() => import("./pages/Calendar.jsx"));
const Staff = lazy(() => import("./pages/Staff.jsx"));
const StaffPlanner = lazy(() => import("./pages/StaffPlanner.jsx"));
const UnitTimeline = lazy(() => import("./pages/UnitTimeline.jsx"));
const NotFound = lazy(() => import("./pages/NotFound.jsx"));
const Business = lazy(() => import("./pages/Business.jsx"));
const ArrivalsDepartures = lazy(() => import("./pages/ArrivalsDepartures.jsx"));
const StaffDirectory = lazy(() => import("./pages/StaffDirectory.jsx"));
const Pricing = lazy(() => import("./pages/Pricing.jsx"));
const BookingDocument = lazy(() => import("./pages/BookingDocument.jsx"));
const Maintenance = lazy(() => import("./pages/Maintenance.jsx"));
const Expenses = lazy(() => import("./pages/Expenses.jsx"));

function PageFallback() {
  return <div style={{ padding: 20 }}>Caricamento pagina...</div>;
}

function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/bookings/:bookingId/document" element={<BookingDocument />} />
        <Route element={<Layout />}>
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
          <Route path="/maintenance" element={<Maintenance />} />
          <Route path="/expenses" element={<Expenses />} />
        </Route>
        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
