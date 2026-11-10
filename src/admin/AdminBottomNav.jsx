import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import './AdminBottomNav.css';

const MORE_LINKS = [
  { to: '/admin/promos', icon: 'fa-tags', label: 'Promos' },
  { to: '/admin/users', icon: 'fa-users', label: 'User Management' },
  { to: '/admin/rewards', icon: 'fa-star', label: 'Rewards' },
  { to: '/admin/settings', icon: 'fa-cog', label: 'Settings' },
];

const MORE_PATHS = new Set(MORE_LINKS.map((l) => l.to));

const AdminBottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { confirm } = useConfirm();
  const [moreOpen, setMoreOpen] = useState(false);

  const allOrders = useQuery(api.orders.getAllOrders) ?? [];
  const validOrders = allOrders.filter((o) => o.orderId && o.items?.length > 0);
  const newOrderCount = validOrders.filter(
    (o) => o.orderStatus === 'pending' || o.orderStatus === 'confirmed'
  ).length;
  const refundCount = validOrders.filter((o) => o.refundStatus === 'requested').length;

  const allPickupRequests = useQuery(api.pickupRequests.getAllPickupRequests) ?? [];
  const riderBadgeCount = allPickupRequests.filter(
    (p) => p.status === 'approved' || p.status === 'out_for_delivery'
  ).length;

  const chatUnreadCount = useQuery(api.supportChat.getAdminUnreadCount) ?? 0;
  const allRedemptions = useQuery(api.rewards.getAllRedemptions) ?? [];
  const pendingRedemptions = allRedemptions.filter((r) => r.status === 'pending').length;

  const path = location.pathname;
  const moreActive = MORE_PATHS.has(path) || path.startsWith('/admin/backup');

  const handleLogout = async () => {
    const ok = await confirm({
      title: 'Logout?',
      message: 'Logout of the admin panel?',
      confirmLabel: 'Logout',
      cancelLabel: 'Stay',
      variant: 'warning',
      icon: 'fa-sign-out-alt',
    });
    if (!ok) return;
    setMoreOpen(false);
    logout();
    navigate('/', { replace: true });
  };

  return (
    <>
      <nav className="admin-bottom-nav" aria-label="Admin navigation">
        <NavLink to="/admin" end className={({ isActive }) => `abn-item ${isActive ? 'active' : ''}`}>
          <i className="fas fa-chart-line"></i>
          <span>Dash</span>
        </NavLink>

        <NavLink to="/admin/orders" className={({ isActive }) => `abn-item ${isActive ? 'active' : ''}`}>
          <span className="abn-icon-wrap">
            <i className="fas fa-shopping-bag"></i>
            {(newOrderCount > 0 || refundCount > 0) && (
              <em className="abn-badge">{newOrderCount + refundCount}</em>
            )}
          </span>
          <span>Orders</span>
        </NavLink>

        <NavLink to="/admin/products" className={({ isActive }) => `abn-item ${isActive ? 'active' : ''}`}>
          <i className="fas fa-box"></i>
          <span>Products</span>
        </NavLink>

        <NavLink to="/admin/riders" className={({ isActive }) => `abn-item ${isActive ? 'active' : ''}`}>
          <span className="abn-icon-wrap">
            <i className="fas fa-motorcycle"></i>
            {riderBadgeCount > 0 && <em className="abn-badge">{riderBadgeCount}</em>}
          </span>
          <span>Riders</span>
        </NavLink>

        <NavLink to="/admin/chat" className={({ isActive }) => `abn-item ${isActive ? 'active' : ''}`}>
          <span className="abn-icon-wrap">
            <i className="fas fa-comments"></i>
            {chatUnreadCount > 0 && <em className="abn-badge">{chatUnreadCount}</em>}
          </span>
          <span>Chat</span>
        </NavLink>

        <button
          type="button"
          className={`abn-item ${moreActive || moreOpen ? 'active' : ''}`}
          onClick={() => setMoreOpen(true)}
        >
          <span className="abn-icon-wrap">
            <i className="fas fa-ellipsis-h"></i>
            {pendingRedemptions > 0 && <em className="abn-badge">{pendingRedemptions}</em>}
          </span>
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="abn-more-overlay" onClick={() => setMoreOpen(false)}>
          <div className="abn-more-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="abn-more-handle" />
            <div className="abn-more-title">More</div>
            <div className="abn-more-list">
              {MORE_LINKS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className="abn-more-link"
                  onClick={() => setMoreOpen(false)}
                >
                  <i className={`fas ${item.icon}`}></i>
                  <span>{item.label}</span>
                  {item.to === '/admin/rewards' && pendingRedemptions > 0 && (
                    <em className="abn-badge inline">{pendingRedemptions}</em>
                  )}
                </NavLink>
              ))}
              <button type="button" className="abn-more-link danger" onClick={handleLogout}>
                <i className="fas fa-sign-out-alt"></i>
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminBottomNav;
