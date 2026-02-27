import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

const AdminSidebar = ({ onLinkClick }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  // Orders badge
  const allOrders = useQuery(api.orders.getAllOrders) ?? [];
  const newOrderCount = allOrders.filter(o =>
    o.orderId && o.items?.length > 0 &&
    (o.orderStatus === 'pending' || o.orderStatus === 'confirmed')
  ).length;

  // ✅ Riders badge — pending applications + pending pickup requests
  const allRiders         = useQuery(api.riders.getAllRiders)                ?? [];
  const allPickupRequests = useQuery(api.pickupRequests.getAllPickupRequests) ?? [];
  const pendingApplications = allRiders.filter(r => r.status === 'pending').length;
  const pendingPickups      = allPickupRequests.filter(p => p.status === 'pending').length;
  const riderBadgeCount     = pendingApplications + pendingPickups;

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      logout();
      navigate('/', { replace: true });
    }
  };

  const handleNavClick = () => {
    if (onLinkClick) onLinkClick();
  };

  return (
    <>
      <div className="admin-logo-container">
        <div className="admin-logo">
          <i className="fas fa-store"></i>
          <span>DKMerch</span>
        </div>
        <div className="admin-tagline">Admin Dashboard</div>
      </div>

      <nav>
        <NavLink to="/admin" end className="admin-nav-link" onClick={handleNavClick}>
          <i className="fas fa-chart-line"></i>
          <span>Dashboard</span>
        </NavLink>

        <NavLink to="/admin/products" className="admin-nav-link" onClick={handleNavClick}>
          <i className="fas fa-box"></i>
          <span>Products</span>
        </NavLink>

        <NavLink to="/admin/inventory" className="admin-nav-link" onClick={handleNavClick}>
          <i className="fas fa-warehouse"></i>
          <span>Inventory</span>
        </NavLink>

        <NavLink to="/admin/orders" className="admin-nav-link" onClick={handleNavClick}>
          <i className="fas fa-shopping-bag"></i>
          <span>Orders</span>
          {newOrderCount > 0 && (
            <span className="order-badge">{newOrderCount}</span>
          )}
        </NavLink>

        <NavLink to="/admin/promos" className="admin-nav-link" onClick={handleNavClick}>
          <i className="fas fa-tags"></i>
          <span>Promos</span>
        </NavLink>

        <NavLink to="/admin/sales-reports" className="admin-nav-link" onClick={handleNavClick}>
          <i className="fas fa-chart-bar"></i>
          <span>Sales Reports</span>
        </NavLink>

        <NavLink to="/admin/users" className="admin-nav-link" onClick={handleNavClick}>
          <i className="fas fa-users"></i>
          <span>User Management</span>
        </NavLink>

        <NavLink to="/admin/riders" className="admin-nav-link" onClick={handleNavClick}>
          <i className="fas fa-motorcycle"></i>
          <span>Riders</span>
          {/* ✅ Shows total of pending applications + pending pickup requests */}
          {riderBadgeCount > 0 && (
            <span className="order-badge">{riderBadgeCount}</span>
          )}
        </NavLink>
      </nav>

      <div className="admin-logout">
        <button className="admin-logout-btn" onClick={handleLogout}>
          <i className="fas fa-sign-out-alt"></i>
          <span>Logout</span>
        </button>
      </div>
    </>
  );
};

export default AdminSidebar;