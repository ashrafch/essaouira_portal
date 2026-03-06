import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { APP_ROUTES } from "./routes/appRoutes";

const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const Units = lazy(() => import("./pages/Units.jsx"));
const Bookings = lazy(() => import("./pages/Bookings.jsx"));
const Calendar = lazy(() => import("./pages/Calendar.jsx"));
const Staff = lazy(() => import("./pages/Staff.jsx"));
const StaffPlanner = lazy(() => import("./pages/StaffPlanner.jsx"));
const OpsAutomation = lazy(() => import("./pages/OpsAutomation.jsx"));
const UnitTimeline = lazy(() => import("./pages/UnitTimeline.jsx"));
const NotFound = lazy(() => import("./pages/NotFound.jsx"));
const Business = lazy(() => import("./pages/Business.jsx"));
const ArrivalsDepartures = lazy(() => import("./pages/ArrivalsDepartures.jsx"));
const StaffDirectory = lazy(() => import("./pages/StaffDirectory.jsx"));
const Pricing = lazy(() => import("./pages/Pricing.jsx"));
const BookingDocument = lazy(() => import("./pages/BookingDocument.jsx"));
const Maintenance = lazy(() => import("./pages/Maintenance.jsx"));
const Expenses = lazy(() => import("./pages/Expenses.jsx"));
const AdminControl = lazy(() => import("./pages/AdminControl.jsx"));
const Login = lazy(() => import("./pages/Login.jsx"));
const SmartOverview = lazy(() => import("./pages/SmartOverview.jsx"));
const SmartUnitDetail = lazy(() => import("./pages/SmartUnitDetail.jsx"));
const Devices = lazy(() => import("./pages/Devices.jsx"));
const Alerts = lazy(() => import("./pages/Alerts.jsx"));

function PageFallback() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        color: "#334155",
        fontWeight: 600,
      }}
    >
      Caricamento pagina...
    </div>
  );
}

const ROUTE_COMPONENTS = {
  dashboard: Dashboard,
  operations: ArrivalsDepartures,
  units: Units,
  unitTimeline: UnitTimeline,
  bookings: Bookings,
  calendar: Calendar,
  staff: Staff,
  staffPlanner: StaffPlanner,
  opsAutomation: OpsAutomation,
  business: Business,
  staffDirectory: StaffDirectory,
  pricing: Pricing,
  maintenance: Maintenance,
  expenses: Expenses,
  adminControl: AdminControl,
  smartOverview: SmartOverview,
  smartUnitDetail: SmartUnitDetail,
  devices: Devices,
  alerts: Alerts,
};

function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/bookings/:bookingId/document"
          element={
            <ProtectedRoute>
              <BookingDocument />
            </ProtectedRoute>
          }
        />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          {APP_ROUTES.map((route) => {
            const Component = ROUTE_COMPONENTS[route.key];
            return <Route key={route.path} path={route.path} element={<Component />} />;
          })}
        </Route>
        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
