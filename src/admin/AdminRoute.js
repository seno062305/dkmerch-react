// src/admin/AdminRoute.js
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const AdminRoute = ({ children }) => {
  const { isAuthenticated, role, isReady } = useAuth();

  // ✅ Wait for session restore before redirecting
  if (!isReady) {
    return (
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        fontSize: "18px",
        color: "#666"
      }}>
        <i className="fas fa-spinner fa-spin" style={{ marginRight: "10px" }}></i>
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/" replace />;
  if (role !== "admin") return <Navigate to="/" replace />;

  return children;
};

export default AdminRoute;