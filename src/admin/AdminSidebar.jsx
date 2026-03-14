import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQuery } from 'convex/react';
import { useConvex } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useBackup } from '../context/BackupContext';
import { TABLES, generateAllTs, downloadTs } from './AdminBackup';
import './AdminSidebar.css';

// ── Logout Backup Modal ───────────────────────────────────────────────────────
const LogoutModal = ({ onClose, onLogoutNoBackup, onLogoutWithBackup, isBackingUp }) => (
  <div className="lo-modal-overlay">
    <div className="lo-modal">
      <div className="lo-modal-icon"><i className="fas fa-database"></i></div>
      <h2 className="lo-modal-title">Before you logout…</h2>
      <p className="lo-modal-desc">
        Do you want to download a backup of all database tables before logging out?
      </p>
      <div className="lo-modal-actions">
        <button className="lo-btn lo-btn--backup" onClick={onLogoutWithBackup} disabled={isBackingUp}>
          {isBackingUp
            ? <><span className="lo-spinner"></span> Preparing backup…</>
            : <><i className="fas fa-file-code"></i> Backup &amp; Logout</>
          }
        </button>
        <button className="lo-btn lo-btn--skip" onClick={onLogoutNoBackup} disabled={isBackingUp}>
          <i className="fas fa-sign-out-alt"></i> Logout without backup
        </button>
        <button className="lo-btn lo-btn--cancel" onClick={onClose} disabled={isBackingUp}>
          Cancel
        </button>
      </div>
    </div>
  </div>
);

// ── Main Sidebar ──────────────────────────────────────────────────────────────
const AdminSidebar = ({ onLinkClick, onClose }) => {
  const { logout } = useAuth();
  const navigate   = useNavigate();
  const convex     = useConvex();
  const { allData } = useBackup();

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isBackingUp,     setIsBackingUp]     = useState(false);

  const allOrders = useQuery(api.orders.getAllOrders) ?? [];
  const validOrders = allOrders.filter(o => o.orderId && o.items?.length > 0);
  const newOrderCount = validOrders.filter(o => o.orderStatus === 'pending' || o.orderStatus === 'confirmed').length;
  const refundCount   = validOrders.filter(o => o.refundStatus === 'requested').length;

  const allRiders         = useQuery(api.riders.getAllRiders)                ?? [];
  const allPickupRequests = useQuery(api.pickupRequests.getAllPickupRequests) ?? [];
  const pendingApplications = allRiders.filter(r => r.status === 'pending').length;
  const pendingPickups      = allPickupRequests.filter(p => p.status === 'pending').length;
  const riderBadgeCount     = pendingApplications + pendingPickups;

  const doLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

  const handleLogoutNoBackup = () => {
    setShowLogoutModal(false);
    doLogout();
  };

  const handleLogoutWithBackup = async () => {
    setIsBackingUp(true);
    try {
      let data = allData;
      const alreadyLoaded = Object.keys(data).length === TABLES.length;

      if (!alreadyLoaded) {
        const freshData = {};
        await Promise.all(
          TABLES.map(async (t) => {
            try {
              freshData[t.key] = await convex.query(t.query);
            } catch (err) {
              freshData[t.key] = [];
              console.error(`Backup fetch failed for ${t.key}:`, err);
            }
          })
        );
        data = freshData;
      }

      const dateStr = new Date().toISOString().split('T')[0];
      downloadTs(generateAllTs(data, new Date().toISOString()), `dkmerch-backup-${dateStr}.ts`);

      await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      console.error('Backup failed:', err);
    } finally {
      setIsBackingUp(false);
      setShowLogoutModal(false);
      doLogout();
    }
  };

  const handleNavClick = () => {
    if (onLinkClick) onLinkClick();
  };

  return (
    <>
      <div className="admin-logo-container">
        <div className="admin-logo-info">
          <div className="admin-logo">
            <i className="fas fa-store"></i>
            <span>DKMerch</span>
          </div>
          <div className="admin-tagline">Admin Dashboard</div>
        </div>
        {onClose && (
          <button className="admin-sidebar-close" onClick={onClose} aria-label="Close menu">
            <i className="fas fa-times"></i>
          </button>
        )}
      </div>

      <nav>
        <NavLink to="/admin" end className="admin-nav-link" onClick={handleNavClick}>
          <i className="fas fa-chart-line"></i><span>Dashboard</span>
        </NavLink>
        <NavLink to="/admin/products" className="admin-nav-link" onClick={handleNavClick}>
          <i className="fas fa-box"></i><span>Products</span>
        </NavLink>
        {/* Item List removed — merged into Products page */}
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
        <NavLink to="/admin/sales-reports" className="admin-nav-link" onClick={handleNavClick}>
          <i className="fas fa-chart-bar"></i><span>Sales Reports</span>
        </NavLink>
        <NavLink to="/admin/users" className="admin-nav-link" onClick={handleNavClick}>
          <i className="fas fa-users"></i><span>User Management</span>
        </NavLink>
        <NavLink to="/admin/riders" className="admin-nav-link" onClick={handleNavClick}>
          <i className="fas fa-motorcycle"></i><span>Riders</span>
          {riderBadgeCount > 0 && <span className="order-badge">{riderBadgeCount}</span>}
        </NavLink>
        <NavLink to="/admin/backup" className="admin-nav-link" onClick={handleNavClick}>
          <i className="fas fa-database"></i><span>Backup</span>
        </NavLink>
      </nav>

      <div className="admin-logout">
        <button className="admin-logout-btn" onClick={() => setShowLogoutModal(true)}>
          <i className="fas fa-sign-out-alt"></i><span>Logout</span>
        </button>
      </div>

      {showLogoutModal && (
        <LogoutModal
          onClose={() => setShowLogoutModal(false)}
          onLogoutNoBackup={handleLogoutNoBackup}
          onLogoutWithBackup={handleLogoutWithBackup}
          isBackingUp={isBackingUp}
        />
      )}
    </>
  );
};

export default AdminSidebar;