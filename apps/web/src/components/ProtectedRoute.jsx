import { Navigate } from "react-router-dom";
import { getCurrentRole, isAuthenticated } from "../services/auth";

function ProtectedRoute({ children, allowedRoles = null }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
    const role = (getCurrentRole() || "viewer").toLowerCase();
    if (!allowedRoles.includes(role)) {
      return <Navigate to="/forbidden" replace />;
    }
  }

  return children;
}

export default ProtectedRoute;
