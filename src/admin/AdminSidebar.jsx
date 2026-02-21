import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const AdminSidebar = ({ onLinkClick }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [newOrderCount, setNewOrderCount] = useState(0);

  useEffect(() => {
    const checkNewOrders = () => {
      const orders = JSON.parse(localStorage.getItem('dkmerch_orders')) || [];
      const validOrders = orders.filter(order => {
        if (!order.orderId && !order.id) return false;
        if (!order.items || !Array.isArray(order.items) || order.items.length === 0) return false;
        return true;
      });
      const pendingOrders = validOrders.filter(order => {
        const status = order.orderStatus || order.status || '';
        return status === 'pending' || status === 'confirmed';
      });
      setNewOrderCount(pendingOrders.length);
    };

    checkNewOrders();
    const handleOrderUpdate = () => checkNewOrders();
    window.addEventListener('storage', handleOrderUpdate);
    window.addEventListener('orderUpdated', handleOrderUpdate);
    return () => {
      window.removeEventListener('storage', handleOrderUpdate);
      window.removeEventListener('orderUpdated', handleOrderUpdate);
    };
  }, []);

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