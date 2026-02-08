// AdminRoute.js
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * AdminRoute component - Requires user to be authenticated AND have admin role
 * Redirects to home page if not authenticated or not admin
 */
const AdminRoute = ({ children }) => {
  const { isAuthenticated, user, loading } = useAuth();

  // Show loading while checking authentication
  if (loading) {
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

  // Redirect to home if not authenticated
  if (!isAuthenticated) {
    alert("Please login as admin to access this page.");
    return <Navigate to="/" replace />;
  }

  // Redirect to home if not admin
  if (user?.role !== "admin") {
    alert("Access denied. Admin privileges required.");
    return <Navigate to="/" replace />;
  }

  // Render children if authenticated and admin
  return children;
};

export default AdminRoute;