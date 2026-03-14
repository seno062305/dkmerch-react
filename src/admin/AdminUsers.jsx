// src/admin/AdminUsers.jsx
import React, { useState } from 'react';
import './AdminUsers.css';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

// ── Suspend reason config ─────────────────────────────────────────────────────
const SUSPEND_REASONS = [
  { value: 'abusive_behavior', label: 'Abusive / Harassing Behavior', defaultDays: 3 },
  { value: 'spam',             label: 'Spam / Fake Orders',           defaultDays: 3 },
  { value: 'payment_fraud',    label: 'Payment Fraud',                defaultDays: 3 },
  { value: 'other',            label: 'Other',                        defaultDays: 1 },
];

const DURATION_OPTIONS = [
  { label: '3 Days',    days: 3    },
  { label: '7 Days',    days: 7    },
  { label: '14 Days',   days: 14   },
  { label: '30 Days',   days: 30   },
  { label: 'Permanent', days: null },
];

const DURATION_OPTIONS_OTHER = [
  { label: '1 Day',     days: 1    },
  { label: '3 Days',    days: 3    },
  { label: '7 Days',    days: 7    },
  { label: '14 Days',   days: 14   },
  { label: '30 Days',   days: 30   },
  { label: 'Permanent', days: null },
];

const STEP_CONFIGURE = 'configure';
const STEP_CONFIRM   = 'confirm';

// ── Rider delete reasons (cleaned up) ────────────────────────────────────────
const RIDER_DELETE_REASONS = [
  { value: 'inactive',          label: 'Account Inactive',     hint: 'Rider has been inactive for a long time' },
  { value: 'policy_violation',  label: 'Policy Violation',     hint: 'Violated DKMerch rider policies' },
  { value: 'request_by_rider',  label: 'Requested by Rider',   hint: 'Rider requested account removal' },
  { value: 'other',             label: 'Other Reason',         hint: 'Specify reason in the note field' },
];

const AdminUsers = () => {
  const [activeTab, setActiveTab] = useState('users');

  // ─── CONVEX DATA ─────────────────────────────────────────────────────────────
  const users  = useQuery(api.users.getAllUsers)   ?? [];
  const riders = useQuery(api.riders.getAllRiders) ?? [];

  const suspendUserMutation   = useMutation(api.users.suspendUser);
  const unsuspendUserMutation = useMutation(api.users.unsuspendUser);
  const deleteUserMutation    = useMutation(api.users.deleteUser);
  const activateUserMutation  = useMutation(api.users.activateUser);
  const deleteRiderMutation   = useMutation(api.riders.deleteRider);

  // ─── USERS STATE ─────────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm]     = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userToDelete, setUserToDelete]           = useState(null);

  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspendStep, setSuspendStep]           = useState(STEP_CONFIGURE);
  const [userToSuspend, setUserToSuspend]       = useState(null);
  const [suspendReason, setSuspendReason]       = useState('');
  const [suspendDays, setSuspendDays]           = useState(null);
  const [suspendNote, setSuspendNote]           = useState('');
  const [suspendLoading, setSuspendLoading]     = useState(false);

  const [showUnsuspendConfirm, setShowUnsuspendConfirm] = useState(false);
  const [userToUnsuspend, setUserToUnsuspend]           = useState(null);

  const [showActivateConfirm, setShowActivateConfirm] = useState(false);
  const [userToActivate, setUserToActivate]           = useState(null);

  // ─── RIDERS STATE ─────────────────────────────────────────────────────────────
  const [riderSearch, setRiderSearch]             = useState('');
  const [riderFilterStatus, setRiderFilterStatus] = useState('all');

  const [showRiderDeleteModal, setShowRiderDeleteModal] = useState(false);
  const [riderDeleteStep, setRiderDeleteStep]           = useState(STEP_CONFIGURE);
  const [riderToDelete, setRiderToDelete]               = useState(null);
  const [riderDeleteReason, setRiderDeleteReason]       = useState('');
  const [riderDeleteNote, setRiderDeleteNote]           = useState('');
  const [riderDeleteLoading, setRiderDeleteLoading]     = useState(false);

  const [notification, setNotification] = useState({ show: false, message: '', type: '' });

  const showNotification = (message, type) => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: '' }), 6000);
  };

  // ─── FILTERED DATA ────────────────────────────────────────────────────────────
  const pendingUsers = users.filter(u => u.status === 'pending_activation');
  const regularUsers = users.filter(u => u.status !== 'pending_activation');

  const filteredUsers = regularUsers.filter(u => {
    if (filterStatus !== 'all' && (u.status || 'active') !== filterStatus) return false;
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      u.name?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q)
    );
  });

  const filteredPending = pendingUsers.filter(u => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      u.name?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  });

  const filteredRiders = riders.filter(r => {
    if (riderFilterStatus !== 'all' && r.status !== riderFilterStatus) return false;
    if (!riderSearch.trim()) return true;
    const q = riderSearch.toLowerCase();
    return (
      r.fullName?.toLowerCase().includes(q) ||
      r.email?.toLowerCase().includes(q) ||
      r.phone?.includes(riderSearch) ||
      r.vehicleType?.toLowerCase().includes(q)
    );
  });

  // ─── SUSPEND HELPERS ──────────────────────────────────────────────────────────
  const openSuspendModal = (user) => {
    setUserToSuspend(user);
    setSuspendReason('');
    setSuspendDays(null);
    setSuspendNote('');
    setSuspendStep(STEP_CONFIGURE);
    setShowSuspendModal(true);
  };

  const closeSuspendModal = () => {
    if (suspendLoading) return;
    setShowSuspendModal(false);
    setSuspendStep(STEP_CONFIGURE);
    setUserToSuspend(null);
    setSuspendReason('');
    setSuspendNote('');
    setSuspendDays(null);
  };

  const handleReasonChange = (value) => {
    setSuspendReason(value);
    const cfg = SUSPEND_REASONS.find(r => r.value === value);
    if (cfg) setSuspendDays(cfg.defaultDays);
  };

  const getDurationOptions = () =>
    suspendReason === 'other' ? DURATION_OPTIONS_OTHER : DURATION_OPTIONS;

  const handleProceedToConfirm = () => {
    if (!suspendReason) return;
    setSuspendStep(STEP_CONFIRM);
  };

  const handleConfirmSuspend = async () => {
    if (!userToSuspend || !suspendReason) return;
    setSuspendLoading(true);
    try {
      await suspendUserMutation({
        id: userToSuspend._id,
        reason: suspendReason,
        note: suspendNote || undefined,
        durationDays: suspendDays ?? undefined,
      });

      const auth = JSON.parse(localStorage.getItem('authUser') || 'null');
      if (auth && auth._id === userToSuspend._id) {
        localStorage.removeItem('authUser');
        window.location.href = '/';
      }

      const durationLabel = suspendDays
        ? `for ${suspendDays} day${suspendDays !== 1 ? 's' : ''}`
        : 'permanently';
      showNotification(
        `${userToSuspend.name} has been suspended ${durationLabel}. An email notification has been sent.`,
        'success'
      );
      closeSuspendModal();
    } catch (err) {
      console.error('Suspend error:', err);
      showNotification('Failed to suspend user. Please try again.', 'error');
    }
    setSuspendLoading(false);
  };

  const confirmUnsuspend = async () => {
    if (!userToUnsuspend) return;
    try {
      await unsuspendUserMutation({ id: userToUnsuspend._id });
      showNotification(`${userToUnsuspend.name} has been unsuspended successfully.`, 'success');
    } catch {
      showNotification('Failed to unsuspend user.', 'error');
    }
    setShowUnsuspendConfirm(false);
    setUserToUnsuspend(null);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await deleteUserMutation({ id: userToDelete._id });
      showNotification('User deleted successfully.', 'success');
    } catch {
      showNotification('Failed to delete user.', 'error');
    }
    setShowDeleteConfirm(false);
    setUserToDelete(null);
  };

  const confirmActivate = async () => {
    if (!userToActivate) return;
    try {
      await activateUserMutation({ id: userToActivate._id });
      showNotification(`${userToActivate.name} has been activated successfully.`, 'success');
    } catch {
      showNotification('Failed to activate user.', 'error');
    }
    setShowActivateConfirm(false);
    setUserToActivate(null);
  };

  // ─── RIDER DELETE HELPERS ─────────────────────────────────────────────────────
  const openRiderDeleteModal = (rider) => {
    setRiderToDelete(rider);
    setRiderDeleteReason('');
    setRiderDeleteNote('');
    setRiderDeleteStep(STEP_CONFIGURE);
    setShowRiderDeleteModal(true);
  };

  const closeRiderDeleteModal = () => {
    if (riderDeleteLoading) return;
    setShowRiderDeleteModal(false);
    setRiderDeleteStep(STEP_CONFIGURE);
    setRiderToDelete(null);
    setRiderDeleteReason('');
    setRiderDeleteNote('');
  };

  // Email is sent automatically for approved/suspended riders — no toggle needed
  const willSendEmail = (rider) =>
    rider && ['approved', 'suspended'].includes(rider.status);

  const confirmDeleteRider = async () => {
    if (!riderToDelete || !riderDeleteReason) return;
    setRiderDeleteLoading(true);
    try {
      await deleteRiderMutation({
        id:        riderToDelete._id,
        reason:    riderDeleteReason,
        note:      riderDeleteNote || undefined,
        sendEmail: willSendEmail(riderToDelete),
      });
      const emailMsg = willSendEmail(riderToDelete) ? ' Email notification sent to rider.' : '';
      showNotification(`${riderToDelete.fullName}'s account has been deleted.${emailMsg}`, 'success');
      closeRiderDeleteModal();
    } catch {
      showNotification('Failed to delete rider.', 'error');
    }
    setRiderDeleteLoading(false);
  };

  const getSelectedDeleteReasonLabel = () =>
    RIDER_DELETE_REASONS.find(r => r.value === riderDeleteReason)?.label || riderDeleteReason || '—';

  // ─── DISPLAY HELPERS ──────────────────────────────────────────────────────────
  const getRoleBadgeClass        = (role)   => role === 'admin' ? 'role-badge admin' : 'role-badge user';
  const getStatusBadgeClass      = (status) => `status-badge ${status || 'active'}`;
  const getRiderStatusBadgeClass = (status) => {
    const map = { pending: 'rider-status-badge pending', approved: 'rider-status-badge approved', rejected: 'rider-status-badge rejected', suspended: 'rider-status-badge suspended' };
    return map[status] || 'rider-status-badge pending';
  };

  const formatDate = (ts) => {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const getSuspendUntilLabel = (user) => {
    if (!user.suspendedUntil) return 'Permanent';
    const diffDays = Math.ceil((user.suspendedUntil - Date.now()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Expires soon';
    return `${diffDays}d left`;
  };

  const getReasonLabel  = (val) => SUSPEND_REASONS.find(r => r.value === val)?.label || val || '—';
  const getDurationLabel = () => {
    if (suspendDays === null) return 'Permanent';
    if (suspendDays === 1) return '1 Day';
    return `${suspendDays} Days`;
  };

  const totalUsers     = regularUsers.length;
  const activeUsers    = regularUsers.filter(u => (u.status || 'active') === 'active').length;
  const suspendedUsers = regularUsers.filter(u => u.status === 'suspended').length;
  const totalRiders    = riders.length;
  const approvedRiders = riders.filter(r => r.status === 'approved').length;
  const pendingRiders  = riders.filter(r => r.status === 'pending').length;

  return (
    <div className="admin-users">

      {notification.show && (
        <div className={`notification ${notification.type}`}>
          <i className={`fas ${notification.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
          <span>{notification.message}</span>
          <button className="notification-close" onClick={() => setNotification({ show: false, message: '', type: '' })}>
            <i className="fas fa-times"></i>
          </button>
        </div>
      )}

      <div className="users-header">
        <div className="header-left">
          <h1><i className="fas fa-users"></i> User Management</h1>
          <p className="subtitle">Manage user accounts and rider registrations</p>
        </div>
        <div className="users-stats">
          {activeTab !== 'riders' ? (
            <>
              <div className="stat-card"><i className="fas fa-users"></i><div><div className="stat-number">{totalUsers}</div><div className="stat-label">Total Users</div></div></div>
              <div className="stat-card"><i className="fas fa-check-circle"></i><div><div className="stat-number">{activeUsers}</div><div className="stat-label">Active</div></div></div>
              <div className="stat-card"><i className="fas fa-ban"></i><div><div className="stat-number">{suspendedUsers}</div><div className="stat-label">Suspended</div></div></div>
            </>
          ) : (
            <>
              <div className="stat-card rider-stat"><i className="fas fa-motorcycle"></i><div><div className="stat-number">{totalRiders}</div><div className="stat-label">Total Riders</div></div></div>
              <div className="stat-card rider-stat"><i className="fas fa-check-circle"></i><div><div className="stat-number">{approvedRiders}</div><div className="stat-label">Approved</div></div></div>
              <div className="stat-card rider-stat"><i className="fas fa-clock"></i><div><div className="stat-number">{pendingRiders}</div><div className="stat-label">Pending</div></div></div>
            </>
          )}
        </div>
      </div>

      <div className="tab-switcher">
        <button className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
          <i className="fas fa-user"></i> Users <span className="tab-count">{totalUsers}</span>
        </button>
        <button className={`tab-btn ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>
          <i className="fas fa-user-clock"></i> Pending Activation <span className="tab-count">{pendingUsers.length}</span>
          {pendingUsers.length > 0 && <span className="tab-badge">{pendingUsers.length}</span>}
        </button>
        <button className={`tab-btn ${activeTab === 'riders' ? 'active' : ''}`} onClick={() => setActiveTab('riders')}>
          <i className="fas fa-motorcycle"></i> Riders <span className="tab-count">{totalRiders}</span>
          {pendingRiders > 0 && <span className="tab-badge">{pendingRiders}</span>}
        </button>
      </div>

      {/* ══ USERS TAB ══════════════════════════════════════════════════════════ */}
      {activeTab === 'users' && (
        <>
          <div className="users-controls">
            <div className="search-box">
              <i className="fas fa-search"></i>
              <input type="text" placeholder="Search by name, username, email, or role..."
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              {searchTerm && <button className="clear-search" onClick={() => setSearchTerm('')}><i className="fas fa-times"></i></button>}
            </div>
            <div className="status-filter">
              {['all', 'active', 'suspended'].map(s => (
                <button key={s} className={`filter-btn ${filterStatus === s ? 'active' : ''}`} onClick={() => setFilterStatus(s)}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="users-table-container">
            {filteredUsers.length === 0 ? (
              <div className="no-users"><i className="fas fa-user-slash"></i><p>No users found</p></div>
            ) : (
              <table className="users-table">
                <thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {filteredUsers.map(user => (
                    <tr key={user._id}>
                      <td className="user-name"><i className="fas fa-user-circle"></i>{user.name}</td>
                      <td>@{user.username}</td>
                      <td>{user.email}</td>
                      <td><span className={getRoleBadgeClass(user.role)}><i className={`fas ${user.role === 'admin' ? 'fa-shield-alt' : 'fa-user'}`}></i>{user.role}</span></td>
                      <td>
                        <div className="status-cell">
                          <span className={getStatusBadgeClass(user.status)}>
                            <i className={`fas ${(user.status || 'active') === 'active' ? 'fa-check-circle' : 'fa-ban'}`}></i>
                            {(user.status || 'active') === 'active' ? 'Active' : 'Suspended'}
                          </span>
                          {user.status === 'suspended' && (
                            <span className="suspend-meta">
                              <span className="suspend-duration-chip"><i className="fas fa-clock"></i>{getSuspendUntilLabel(user)}</span>
                              {user.suspendReason && <span className="suspend-reason-chip">{getReasonLabel(user.suspendReason)}</span>}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="actions-cell">
                        {user.email !== 'admin' && user.role !== 'admin' && (
                          (user.status || 'active') === 'active' ? (
                            <button className="btn-suspend" onClick={() => openSuspendModal(user)} title="Suspend user">
                              <i className="fas fa-ban"></i>
                            </button>
                          ) : (
                            <button className="btn-suspend btn-activate"
                              onClick={() => { setUserToUnsuspend(user); setShowUnsuspendConfirm(true); }}
                              title="Unsuspend user">
                              <i className="fas fa-check-circle"></i>
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ══ PENDING ACTIVATION TAB ═════════════════════════════════════════════ */}
      {activeTab === 'pending' && (
        <>
          <div className="users-controls">
            <div className="search-box">
              <i className="fas fa-search"></i>
              <input type="text" placeholder="Search pending users..."
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              {searchTerm && <button className="clear-search" onClick={() => setSearchTerm('')}><i className="fas fa-times"></i></button>}
            </div>
            <div style={{ color: '#e53e3e', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-shield-alt"></i>
              These accounts were flagged as suspicious and require manual activation.
            </div>
          </div>
          <div className="users-table-container">
            {filteredPending.length === 0 ? (
              <div className="no-users">
                <i className="fas fa-check-circle" style={{ color: '#28a745' }}></i>
                <p>No pending activations — no suspicious registrations detected!</p>
              </div>
            ) : (
              <table className="users-table">
                <thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Registered</th><th>Reason</th><th>Actions</th></tr></thead>
                <tbody>
                  {filteredPending.map(user => (
                    <tr key={user._id}>
                      <td className="user-name"><i className="fas fa-user-clock" style={{ color: '#ed8936' }}></i>{user.name}</td>
                      <td>@{user.username}</td>
                      <td>{user.email}</td>
                      <td className="date-cell">{formatDate(user.registeredAt)}</td>
                      <td>
                        <span style={{ background: '#fff3cd', color: '#856404', padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                          <i className="fas fa-robot" style={{ marginRight: 4 }}></i>
                          {user.suspendReason === 'spam_registration' ? 'Spam/Bot Detection' : user.suspendReason || 'Flagged'}
                        </span>
                      </td>
                      <td className="actions-cell">
                        <button className="btn-suspend btn-activate" title="Activate"
                          onClick={() => { setUserToActivate(user); setShowActivateConfirm(true); }}>
                          <i className="fas fa-check-circle"></i>
                        </button>
                        <button className="btn-delete" title="Delete"
                          onClick={() => { setUserToDelete(user); setShowDeleteConfirm(true); }}>
                          <i className="fas fa-trash"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ══ RIDERS TAB ═════════════════════════════════════════════════════════ */}
      {activeTab === 'riders' && (
        <>
          <div className="users-controls">
            <div className="search-box">
              <i className="fas fa-search"></i>
              <input type="text" placeholder="Search by name, email, phone, vehicle..."
                value={riderSearch} onChange={e => setRiderSearch(e.target.value)} />
              {riderSearch && <button className="clear-search" onClick={() => setRiderSearch('')}><i className="fas fa-times"></i></button>}
            </div>
            <div className="status-filter">
              {['all', 'pending', 'approved', 'rejected', 'suspended'].map(s => (
                <button key={s} className={`filter-btn ${riderFilterStatus === s ? 'active' : ''}`} onClick={() => setRiderFilterStatus(s)}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="users-table-container">
            {filteredRiders.length === 0 ? (
              <div className="no-users"><i className="fas fa-motorcycle"></i><p>No riders found</p></div>
            ) : (
              <table className="users-table">
                <thead><tr><th>Full Name</th><th>Email</th><th>Phone</th><th>Vehicle</th><th>Status</th><th>Applied</th><th>Actions</th></tr></thead>
                <tbody>
                  {filteredRiders.map(rider => (
                    <tr key={rider._id}>
                      <td className="user-name"><i className="fas fa-motorcycle" style={{ color: '#7c3aed' }}></i>{rider.fullName}</td>
                      <td>{rider.email}</td>
                      <td>{rider.phone}</td>
                      <td style={{ textTransform: 'capitalize' }}>{rider.vehicleType}</td>
                      <td>
                        <span className={getRiderStatusBadgeClass(rider.status)}>
                          {rider.status === 'approved'  && <i className="fas fa-check-circle"></i>}
                          {rider.status === 'pending'   && <i className="fas fa-clock"></i>}
                          {rider.status === 'rejected'  && <i className="fas fa-times-circle"></i>}
                          {rider.status === 'suspended' && <i className="fas fa-ban"></i>}
                          {rider.status}
                        </span>
                      </td>
                      <td className="date-cell">{formatDate(rider.appliedAt)}</td>
                      <td className="actions-cell">
                        <button className="btn-delete" onClick={() => openRiderDeleteModal(rider)} title="Delete">
                          <i className="fas fa-trash"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ══ SUSPEND MODAL ══════════════════════════════════════════════════════ */}
      {showSuspendModal && (
        <div className="modal-overlay" onClick={closeSuspendModal}>
          <div className="modal-content suspend-modal" onClick={e => e.stopPropagation()}>

            {suspendStep === STEP_CONFIGURE && (
              <>
                <div className="modal-header suspend-modal-header">
                  <h2><i className="fas fa-ban"></i> Suspend Account</h2>
                  <button className="close-btn" onClick={closeSuspendModal}><i className="fas fa-times"></i></button>
                </div>
                <div className="suspend-modal-body">
                  <div className="suspend-user-pill">
                    <i className="fas fa-user-circle"></i>
                    <div>
                      <div className="suspend-user-name">{userToSuspend?.name}</div>
                      <div className="suspend-user-email">{userToSuspend?.email}</div>
                    </div>
                  </div>
                  <div className="form-group">
                    <label><i className="fas fa-exclamation-triangle"></i> Reason <span className="required-star">*</span></label>
                    <div className="reason-grid">
                      {SUSPEND_REASONS.map(r => (
                        <button key={r.value} type="button"
                          className={`reason-chip ${suspendReason === r.value ? 'active' : ''}`}
                          onClick={() => handleReasonChange(r.value)}>
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {suspendReason && (
                    <div className="form-group">
                      <label><i className="fas fa-calendar-alt"></i> Duration</label>
                      <div className="duration-grid">
                        {getDurationOptions().map(d => (
                          <button key={d.label} type="button"
                            className={`duration-chip ${suspendDays === d.days ? 'active' : ''} ${d.days === null ? 'permanent-chip' : ''}`}
                            onClick={() => setSuspendDays(d.days)}>
                            {d.days === null && <i className="fas fa-infinity"></i>}
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {suspendReason && (
                    <div className="form-group">
                      <label><i className="fas fa-sticky-note"></i> Note <span className="optional-label">(optional)</span></label>
                      <textarea className="suspend-note" placeholder="Add a note..."
                        value={suspendNote} onChange={e => setSuspendNote(e.target.value)} rows={3} />
                    </div>
                  )}
                  {suspendReason && (
                    <div className={`suspend-warning-box ${suspendDays === null ? 'permanent' : 'temporary'}`}>
                      <i className={`fas ${suspendDays === null ? 'fa-exclamation-circle' : 'fa-info-circle'}`}></i>
                      <div>
                        {suspendDays === null
                          ? <><strong>Permanent suspension</strong> — the user will lose access indefinitely and receive an email notification.</>
                          : <><strong>{suspendDays}-day suspension</strong> — auto-restores after {suspendDays} day{suspendDays !== 1 ? 's' : ''}. Email notification will be sent.</>
                        }
                      </div>
                    </div>
                  )}
                  <div className="modal-actions">
                    <button className="btn-cancel" onClick={closeSuspendModal}>Cancel</button>
                    <button className="btn-suspend-confirm" onClick={handleProceedToConfirm} disabled={!suspendReason || suspendDays === undefined}>
                      <i className="fas fa-arrow-right"></i> Review & Confirm
                    </button>
                  </div>
                </div>
              </>
            )}

            {suspendStep === STEP_CONFIRM && (
              <>
                <div className="modal-header suspend-modal-header">
                  <h2><i className="fas fa-exclamation-triangle"></i> Confirm Suspension</h2>
                  <button className="close-btn" onClick={closeSuspendModal} disabled={suspendLoading}><i className="fas fa-times"></i></button>
                </div>
                <div className="suspend-modal-body">
                  <div className="suspend-confirm-summary">
                    <div className="suspend-confirm-icon"><i className="fas fa-ban"></i></div>
                    <p className="suspend-confirm-headline">You are about to suspend <strong>{userToSuspend?.name}</strong></p>
                    <p className="suspend-confirm-sub">{userToSuspend?.email}</p>
                    <div className="suspend-confirm-details">
                      <div className="suspend-confirm-row">
                        <span className="suspend-confirm-label"><i className="fas fa-exclamation-triangle"></i> Reason</span>
                        <span className="suspend-confirm-value">{getReasonLabel(suspendReason)}</span>
                      </div>
                      <div className="suspend-confirm-row">
                        <span className="suspend-confirm-label"><i className="fas fa-calendar-alt"></i> Duration</span>
                        <span className={`suspend-confirm-value ${suspendDays === null ? 'permanent-label' : ''}`}>{getDurationLabel()}</span>
                      </div>
                      {suspendNote && (
                        <div className="suspend-confirm-row">
                          <span className="suspend-confirm-label"><i className="fas fa-sticky-note"></i> Note</span>
                          <span className="suspend-confirm-value">{suspendNote}</span>
                        </div>
                      )}
                      <div className="suspend-confirm-row">
                        <span className="suspend-confirm-label"><i className="fas fa-envelope"></i> Email</span>
                        <span className="suspend-confirm-value">Notification will be sent</span>
                      </div>
                    </div>
                  </div>
                  <div className={`suspend-final-warning ${suspendDays === null ? 'permanent' : 'temporary'}`}>
                    <i className="fas fa-exclamation-circle"></i>
                    <span>
                      {suspendDays === null
                        ? 'Permanent suspension — cannot log in until manually unsuspended.'
                        : `Account will be locked for ${suspendDays} day${suspendDays !== 1 ? 's' : ''} and automatically restored afterward.`
                      }
                    </span>
                  </div>
                  <div className="modal-actions">
                    <button className="btn-cancel" onClick={() => setSuspendStep(STEP_CONFIGURE)} disabled={suspendLoading}>
                      <i className="fas fa-arrow-left"></i> Go Back
                    </button>
                    <button className="btn-suspend-confirm" onClick={handleConfirmSuspend} disabled={suspendLoading}>
                      {suspendLoading ? <><i className="fas fa-spinner fa-spin"></i> Suspending...</> : <><i className="fas fa-ban"></i> Yes, Suspend Account</>}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══ UNSUSPEND CONFIRM ══════════════════════════════════════════════════ */}
      {showUnsuspendConfirm && (
        <div className="modal-overlay" onClick={() => setShowUnsuspendConfirm(false)}>
          <div className="modal-content confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="confirm-icon activate"><i className="fas fa-check-circle"></i></div>
            <h2>Unsuspend Account?</h2>
            <p>Restore access for <strong>{userToUnsuspend?.name}</strong>?</p>
            <p className="success-text">They will be able to log in immediately.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowUnsuspendConfirm(false)}>Cancel</button>
              <button className="btn-activate-confirm" onClick={confirmUnsuspend}><i className="fas fa-check-circle"></i> Unsuspend</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ ACTIVATE CONFIRM ═══════════════════════════════════════════════════ */}
      {showActivateConfirm && (
        <div className="modal-overlay" onClick={() => setShowActivateConfirm(false)}>
          <div className="modal-content confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="confirm-icon activate"><i className="fas fa-user-check"></i></div>
            <h2>Activate Account?</h2>
            <p>Activate <strong>{userToActivate?.name}</strong>'s account?</p>
            <p className="success-text">They will be able to log in immediately after activation.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowActivateConfirm(false)}>Cancel</button>
              <button className="btn-activate-confirm" onClick={confirmActivate}><i className="fas fa-check-circle"></i> Activate</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ DELETE USER CONFIRM ════════════════════════════════════════════════ */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-content confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="confirm-icon suspend"><i className="fas fa-trash"></i></div>
            <h2>Delete User?</h2>
            <p>Permanently delete <strong>{userToDelete?.name}</strong>?</p>
            <p className="warning-text">This action cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className="btn-suspend-confirm" onClick={confirmDeleteUser}><i className="fas fa-trash"></i> Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          RIDER DELETE MODAL — TWO STEPS
      ══════════════════════════════════════════════════════════════════════ */}
      {showRiderDeleteModal && riderToDelete && (
        <div className="modal-overlay" onClick={closeRiderDeleteModal}>
          <div className="modal-content suspend-modal" onClick={e => e.stopPropagation()}>

            {riderDeleteStep === STEP_CONFIGURE && (
              <>
                <div className="modal-header" style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
                  <h2><i className="fas fa-trash"></i> Delete Rider Account</h2>
                  <button className="close-btn" onClick={closeRiderDeleteModal}><i className="fas fa-times"></i></button>
                </div>
                <div className="suspend-modal-body">
                  <div className="suspend-user-pill">
                    <i className="fas fa-motorcycle" style={{ color: '#7c3aed', fontSize: 28 }}></i>
                    <div>
                      <div className="suspend-user-name">{riderToDelete.fullName}</div>
                      <div className="suspend-user-email">{riderToDelete.email}</div>
                      <span className={getRiderStatusBadgeClass(riderToDelete.status)} style={{ fontSize: 10, padding: '2px 8px', marginTop: 4, display: 'inline-flex' }}>
                        {riderToDelete.status}
                      </span>
                    </div>
                  </div>

                  <div className="form-group">
                    <label><i className="fas fa-exclamation-triangle"></i> Reason for Deletion <span className="required-star">*</span></label>
                    <div className="reason-grid">
                      {RIDER_DELETE_REASONS.map(r => (
                        <button key={r.value} type="button"
                          className={`reason-chip ${riderDeleteReason === r.value ? 'active' : ''}`}
                          onClick={() => setRiderDeleteReason(r.value)}
                          style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                          <span style={{ fontWeight: 700 }}>{r.label}</span>
                          <span style={{ fontSize: 10, opacity: 0.75, fontWeight: 400 }}>{r.hint}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {riderDeleteReason && (
                    <div className="form-group">
                      <label><i className="fas fa-sticky-note"></i> Note <span className="optional-label">(optional)</span></label>
                      <textarea className="suspend-note" placeholder="Add a note for records..."
                        value={riderDeleteNote} onChange={e => setRiderDeleteNote(e.target.value)} rows={2} />
                    </div>
                  )}

                  {/* Auto email info — no toggle, just informational */}
                  {riderDeleteReason && willSendEmail(riderToDelete) && (
                    <div className="suspend-warning-box temporary">
                      <i className="fas fa-envelope"></i>
                      <div>
                        <strong>Email notification will be sent</strong> to <strong>{riderToDelete.email}</strong> informing them of the account deletion.
                      </div>
                    </div>
                  )}

                  {riderDeleteReason && (
                    <div className="suspend-warning-box permanent" style={{ marginTop: 8 }}>
                      <i className="fas fa-exclamation-circle"></i>
                      <div><strong>This action is permanent.</strong> All rider data will be removed and cannot be undone.</div>
                    </div>
                  )}

                  <div className="modal-actions">
                    <button className="btn-cancel" onClick={closeRiderDeleteModal}>Cancel</button>
                    <button className="btn-suspend-confirm"
                      style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}
                      onClick={() => riderDeleteReason && setRiderDeleteStep(STEP_CONFIRM)}
                      disabled={!riderDeleteReason}>
                      <i className="fas fa-arrow-right"></i> Review & Confirm
                    </button>
                  </div>
                </div>
              </>
            )}

            {riderDeleteStep === STEP_CONFIRM && (
              <>
                <div className="modal-header" style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
                  <h2><i className="fas fa-exclamation-triangle"></i> Confirm Deletion</h2>
                  <button className="close-btn" onClick={closeRiderDeleteModal} disabled={riderDeleteLoading}><i className="fas fa-times"></i></button>
                </div>
                <div className="suspend-modal-body">
                  <div className="suspend-confirm-summary">
                    <div className="suspend-confirm-icon" style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
                      <i className="fas fa-trash"></i>
                    </div>
                    <p className="suspend-confirm-headline">Permanently delete <strong>{riderToDelete.fullName}</strong>?</p>
                    <p className="suspend-confirm-sub">{riderToDelete.email}</p>
                    <div className="suspend-confirm-details">
                      <div className="suspend-confirm-row">
                        <span className="suspend-confirm-label"><i className="fas fa-exclamation-triangle"></i> Reason</span>
                        <span className="suspend-confirm-value">{getSelectedDeleteReasonLabel()}</span>
                      </div>
                      {riderDeleteNote && (
                        <div className="suspend-confirm-row">
                          <span className="suspend-confirm-label"><i className="fas fa-sticky-note"></i> Note</span>
                          <span className="suspend-confirm-value">{riderDeleteNote}</span>
                        </div>
                      )}
                      <div className="suspend-confirm-row">
                        <span className="suspend-confirm-label"><i className="fas fa-envelope"></i> Email</span>
                        <span className="suspend-confirm-value">
                          {willSendEmail(riderToDelete) ? 'Notification will be sent' : 'No email (pending/rejected)'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="suspend-final-warning permanent">
                    <i className="fas fa-exclamation-circle"></i>
                    <span>This is permanent and cannot be undone. All rider data will be deleted.</span>
                  </div>
                  <div className="modal-actions">
                    <button className="btn-cancel" onClick={() => setRiderDeleteStep(STEP_CONFIGURE)} disabled={riderDeleteLoading}>
                      <i className="fas fa-arrow-left"></i> Go Back
                    </button>
                    <button className="btn-suspend-confirm"
                      style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}
                      onClick={confirmDeleteRider}
                      disabled={riderDeleteLoading}>
                      {riderDeleteLoading
                        ? <><i className="fas fa-spinner fa-spin"></i> Deleting...</>
                        : <><i className="fas fa-trash"></i> Yes, Delete Account</>
                      }
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminUsers;