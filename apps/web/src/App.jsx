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
const UnitTimeline = lazy(() => import("./pages/UnitTimeline.jsx"));
const NotFound = lazy(() => import("./pages/NotFound.jsx"));
const Business = lazy(() => import("./pages/Business.jsx"));
const ArrivalsDepartures = lazy(() => import("./pages/ArrivalsDepartures.jsx"));
const StaffDirectory = lazy(() => import("./pages/StaffDirectory.jsx"));
const Pricing = lazy(() => import("./pages/Pricing.jsx"));
const BookingDocument = lazy(() => import("./pages/BookingDocument.jsx"));
const Maintenance = lazy(() => import("./pages/Maintenance.jsx"));
const Expenses = lazy(() => import("./pages/Expenses.jsx"));
const Login = lazy(() => import("./pages/Login.jsx"));
const SmartOverview = lazy(() => import("./pages/SmartOverview.jsx"));
const SmartDevices = lazy(() => import("./pages/SmartDevices.jsx"));
const SmartAlerts = lazy(() => import("./pages/SmartAlerts.jsx"));
const SmartAutomation = lazy(() => import("./pages/SmartAutomation.jsx"));
const SmartUnitDetail = lazy(() => import("./pages/SmartUnitDetail.jsx"));
const SetupWizard = lazy(() => import("./pages/SetupWizard.jsx"));
const Properties = lazy(() => import("./pages/Properties.jsx"));
const AdminControl = lazy(() => import("./pages/AdminControl.jsx"));
const Forbidden = lazy(() => import("./pages/Forbidden.jsx"));

function PageFallback() {
  return <div style={{ padding: 20 }}>Caricamento pagina...</div>;
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
  business: Business,
  staffDirectory: StaffDirectory,
  pricing: Pricing,
  maintenance: Maintenance,
  expenses: Expenses,
  smartOverview: SmartOverview,
  smartDevices: SmartDevices,
  smartAlerts: SmartAlerts,
  smartAutomation: SmartAutomation,
  smartUnitDetail: SmartUnitDetail,
  setupWizard: SetupWizard,
  properties: Properties,
  adminControl: AdminControl,
};

function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/bookings/:bookingId/document"
          element={
            <ProtectedRoute allowedRoles={["owner", "manager", "operator", "viewer"]}>
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
            return (
              <Route
                key={route.path}
                path={route.path}
                element={
                  <ProtectedRoute allowedRoles={route.allowedRoles}>
                    <Component />
                  </ProtectedRoute>
                }
              />
            );
          })}
        </Route>
        <Route path="/forbidden" element={<Forbidden />} />
        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
