import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQuery, useMutation, useConvex } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useBackup } from '../context/BackupContext';
import { TABLES } from './AdminBackup';
import { downloadEncryptedBackupExcel } from './lib/backupExcel';
import { formatExportCooldownMessage } from './lib/exportCooldown';
import './AdminSidebar.css';

// ── Logout Backup Modal ───────────────────────────────────────────────────────
const LogoutModal = ({
  onClose, onLogoutNoBackup, onLogoutWithBackup, isBackingUp,
  step, password, setPassword, passwordError, showPw, setShowPw,
}) => (
  <div className="lo-modal-overlay">
    <div className="lo-modal">
      <div className="lo-modal-icon"><i className="fas fa-database"></i></div>
      <h2 className="lo-modal-title">Confirm logout</h2>
      {step === 'choose' ? (
        <>
          <p className="lo-modal-desc">
            Are you sure you want to logout of the admin panel?
            You can download a password-locked Excel backup of all Convex tables first.
          </p>
          <div className="lo-modal-actions">
            <button className="lo-btn lo-btn--backup" onClick={onLogoutWithBackup} disabled={isBackingUp}>
              <i className="fas fa-file-excel"></i> Backup &amp; Logout
            </button>
            <button className="lo-btn lo-btn--skip" onClick={onLogoutNoBackup} disabled={isBackingUp}>
              <i className="fas fa-sign-out-alt"></i> Logout without backup
            </button>
            <button className="lo-btn lo-btn--cancel" onClick={onClose} disabled={isBackingUp}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="lo-modal-desc">
            Enter your current admin password. The Excel file will require this same password to open.
          </p>
          <div className="lo-pw-field">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Admin password"
              autoFocus
              disabled={isBackingUp}
              onKeyDown={e => { if (e.key === 'Enter') onLogoutWithBackup(); }}
            />
            <button type="button" onClick={() => setShowPw(s => !s)} tabIndex={-1}>
              <i className={`fas ${showPw ? 'fa-eye-slash' : 'fa-eye'}`}></i>
            </button>
          </div>
          {passwordError && <p className="lo-pw-error">{passwordError}</p>}
          <div className="lo-modal-actions">
            <button className="lo-btn lo-btn--backup" onClick={onLogoutWithBackup} disabled={isBackingUp || !password.trim()}>
              {isBackingUp
                ? <><span className="lo-spinner"></span> Encrypting backup…</>
                : <><i className="fas fa-lock"></i> Verify &amp; Backup</>
              }
            </button>
            <button className="lo-btn lo-btn--cancel" onClick={onClose} disabled={isBackingUp}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  </div>
);

// ── Main Sidebar ──────────────────────────────────────────────────────────────
const AdminSidebar = ({ onLinkClick, onClose, onToggleCollapse }) => {
  const { logout, user } = useAuth();
  const navigate   = useNavigate();
  const convex     = useConvex();
  const { allData } = useBackup();
  const verifyUserPassword = useMutation(api.users.verifyUserPassword);

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isBackingUp,     setIsBackingUp]     = useState(false);
  const [logoutStep, setLogoutStep] = useState('choose');
  const [logoutPassword, setLogoutPassword] = useState('');
  const [logoutPwError, setLogoutPwError] = useState('');
  const [showLogoutPw, setShowLogoutPw] = useState(false);

  const allOrders = useQuery(api.orders.getAllOrders) ?? [];
  const validOrders = allOrders.filter(o => o.orderId && o.items?.length > 0);
  const newOrderCount = validOrders.filter(o => o.orderStatus === 'pending' || o.orderStatus === 'confirmed').length;
  const refundCount   = validOrders.filter(o => o.refundStatus === 'requested').length;

  const allPickupRequests = useQuery(api.pickupRequests.getAllPickupRequests) ?? [];
  const riderBadgeCount = allPickupRequests.filter(
    p => p.status === 'approved' || p.status === 'out_for_delivery'
  ).length;

  // ✅ Rewards pending redemptions badge
  const allRedemptions  = useQuery(api.rewards.getAllRedemptions) ?? [];
  const pendingRedemptions = allRedemptions.filter(r => r.status === 'pending').length;

  const doLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

  const resetLogoutModal = () => {
    setShowLogoutModal(false);
    setLogoutStep('choose');
    setLogoutPassword('');
    setLogoutPwError('');
    setShowLogoutPw(false);
    setIsBackingUp(false);
  };

  const handleLogoutNoBackup = () => {
    resetLogoutModal();
    doLogout();
  };

  const handleLogoutWithBackup = async () => {
    if (logoutStep === 'choose') {
      setLogoutStep('password');
      setLogoutPwError('');
      return;
    }

    const pw = logoutPassword.trim();
    if (!pw) { setLogoutPwError('Password is required.'); return; }
    if (!user?._id && !user?.id) { setLogoutPwError('Admin session missing.'); return; }

    setIsBackingUp(true);
    setLogoutPwError('');
    try {
      const verified = await verifyUserPassword({ id: user._id || user.id, password: pw });
      if (!verified?.success) {
        setLogoutPwError(verified?.message || 'Incorrect password.');
        setIsBackingUp(false);
        return;
      }

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
      await downloadEncryptedBackupExcel(data, pw, `dkmerch-backup-${dateStr}.xlsx`);
      await new Promise(r => setTimeout(r, 400));
      resetLogoutModal();
      doLogout();
    } catch (err) {
      console.error('Backup failed:', err);
      setLogoutPwError(formatExportCooldownMessage(err) || 'Backup failed.');
      setIsBackingUp(false);
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
        {/* ✅ Rewards tab */}
        <NavLink to="/admin/rewards" className="admin-nav-link" onClick={handleNavClick}>
          <i className="fas fa-star"></i><span>Rewards</span>
          {pendingRedemptions > 0 && <span className="order-badge">{pendingRedemptions}</span>}
        </NavLink>
        <NavLink to="/admin/settings" className="admin-nav-link" onClick={handleNavClick}>
          <i className="fas fa-cog"></i><span>Settings</span>
        </NavLink>
      </nav>

      <div className="admin-logout">
        <button className="admin-logout-btn" onClick={() => { setLogoutStep('choose'); setShowLogoutModal(true); }}>
          <i className="fas fa-sign-out-alt"></i><span>Logout</span>
        </button>
      </div>

      {showLogoutModal && (
        <LogoutModal
          onClose={resetLogoutModal}
          onLogoutNoBackup={handleLogoutNoBackup}
          onLogoutWithBackup={handleLogoutWithBackup}
          isBackingUp={isBackingUp}
          step={logoutStep}
          password={logoutPassword}
          setPassword={(v) => { setLogoutPassword(v); setLogoutPwError(''); }}
          passwordError={logoutPwError}
          showPw={showLogoutPw}
          setShowPw={setShowLogoutPw}
        />
      )}
    </>
  );
};

export default AdminSidebar;