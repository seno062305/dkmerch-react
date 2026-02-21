import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Admin from "./Admin";
import AdminDashboard from "./AdminDashboard";
import AdminProducts from "./AdminProducts";
import AdminInventory from "./AdminInventory";
import AdminOrders from "./AdminOrders";
import AdminPromos from "./AdminPromos";
import AdminSalesReports from "./AdminSalesReports";
import AdminUsers from "./AdminUsers";
import AdminRiders from "./AdminRiders"; // ✅ NEW

const AdminRoute = ({ children }) => {
  const { isAuthenticated, role } = useAuth();

  if (!isAuthenticated) return <Navigate to="/" replace />;
  if (role !== "admin") return <Navigate to="/" replace />;

  return children;
};

export default AdminRoute;