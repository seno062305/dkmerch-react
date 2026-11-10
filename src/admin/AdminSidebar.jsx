import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import { getOverlayRoot } from '../utils/scrollLock';
import './AdminSidebar.css';

const LogoutModal = ({ onClose, onConfirm }) => {
  useBodyScrollLock(true);
  return (
    <div className="lo-modal-overlay">
      <div className="lo-modal">
        <h2 className="lo-modal-title">Confirm logout</h2>
        <p className="lo-modal-desc">
          Are you sure you want to logout of the admin panel?
        </p>
        <div className="lo-modal-actions">
          <button type="button" className="lo-btn lo-btn--backup" onClick={onConfirm}>
            Logout
          </button>
          <button type="button" className="lo-btn lo-btn--cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

const AdminSidebar = ({ onLinkClick, onClose, onToggleCollapse }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const allOrders = useQuery(api.orders.getAllOrders) ?? [];
  const validOrders = allOrders.filter(o => o.orderId && o.items?.length > 0);
  const newOrderCount = validOrders.filter(o => o.orderStatus === 'pending' || o.orderStatus === 'confirmed').length;
  const refundCount = validOrders.filter(o => o.refundStatus === 'requested').length;

  const allPickupRequests = useQuery(api.pickupRequests.getAllPickupRequests) ?? [];
  const riderBadgeCount = allPickupRequests.filter(
    p => p.status === 'approved' || p.status === 'out_for_delivery'
  ).length;

  const allRedemptions = useQuery(api.rewards.getAllRedemptions) ?? [];
  const pendingRedemptions = allRedemptions.filter(r => r.status === 'pending').length;
  const chatUnreadCount = useQuery(api.supportChat.getAdminUnreadCount) ?? 0;

  const doLogout = () => {
    setShowLogoutModal(false);
    logout();
    navigate('/', { replace: true });
  };

  const handleNavClick = () => {
    if (onLinkClick) onLinkClick();
  };

  return (
    <>
      <div className="admin-logo-container">
        <div className="admin-logo-info">
          <div className="admin-logo">
            <img src="/images/dklogo.jpg" alt="DKMerch" className="admin-logo-img" />
            <span>DKMerch</span>
          </div>
          <div className="admin-tagline">Admin Dashboard</div>
        </div>
        <div className="admin-logo-actions">
          {onToggleCollapse && (
            <button
              type="button"
              className="admin-sidebar-collapse"
              onClick={onToggleCollapse}
              aria-label="Hide sidebar"
              title="Hide sidebar"
            >
              <i className="fas fa-angles-left"></i>
            </button>
          )}
          {onClose && (
            <button className="admin-sidebar-close" onClick={onClose} aria-label="Close menu">
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>
      </div>

      <nav>
        <NavLink to="/admin" end className="admin-nav-link" onClick={handleNavClick}>
          <i className="fas fa-chart-line"></i><span>Dashboard</span>
        </NavLink>
        <NavLink to="/admin/products" className="admin-nav-link" onClick={handleNavClick}>
          <i className="fas fa-box"></i><span>Products</span>
        </NavLink>
        <NavLink to="/admin/orders" className="admin-nav-link" onClick={handleNavClick}>
          <i className="fas fa-shopping-bag"></i><span>Orders</span>
          {newOrderCount > 0 && <span className="order-badge">{newOrderCount}</span>}
          {refundCount > 0 && (
            <span className="refund-sidebar-badge" title={`${refundCount} refund request${refundCount > 1 ? 's' : ''}`}>
              <i className="fas fa-undo-alt"></i> {refundCount}
            </span>
          )}
        </NavLink>
        <NavLink to="/admin/promos" className="admin-nav-link" onClick={handleNavClick}>
          <i className="fas fa-tags"></i><span>Promos</span>
        </NavLink>
        <NavLink to="/admin/users" className="admin-nav-link" onClick={handleNavClick}>
          <i className="fas fa-users"></i><span>User Management</span>
        </NavLink>
        <NavLink to="/admin/riders" className="admin-nav-link" onClick={handleNavClick}>
          <i className="fas fa-motorcycle"></i><span>Riders</span>
          {riderBadgeCount > 0 && <span className="order-badge">{riderBadgeCount}</span>}
        </NavLink>
        <NavLink to="/admin/rewards" className="admin-nav-link" onClick={handleNavClick}>
          <i className="fas fa-star"></i><span>Rewards</span>
          {pendingRedemptions > 0 && <span className="order-badge">{pendingRedemptions}</span>}
        </NavLink>
        <NavLink to="/admin/chat" className="admin-nav-link" onClick={handleNavClick}>
          <i className="fas fa-comments"></i><span>Chat</span>
          {chatUnreadCount > 0 && <span className="order-badge">{chatUnreadCount}</span>}
        </NavLink>
        <NavLink to="/admin/settings" className="admin-nav-link" onClick={handleNavClick}>
          <i className="fas fa-cog"></i><span>Settings</span>
        </NavLink>
      </nav>

      <div className="admin-logout">
        <button type="button" className="admin-logout-btn" onClick={() => setShowLogoutModal(true)}>
          <i className="fas fa-sign-out-alt"></i><span>Logout</span>
        </button>
      </div>

      {showLogoutModal && createPortal(
        <LogoutModal
          onClose={() => setShowLogoutModal(false)}
          onConfirm={doLogout}
        />,
        getOverlayRoot() || document.body
      )}
    </>
  );
};

export default AdminSidebar;
