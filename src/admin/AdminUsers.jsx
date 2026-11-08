// src/admin/AdminUsers.jsx
import React, { useState, useRef } from 'react';
import './AdminUsers.css';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useConfirm } from '../context/ConfirmContext';

const RiderViewModal = ({ rider, onClose }) => {
  const cardRef = useRef();
  const handlePrint = () => {
    if (!cardRef.current) return;
    const win = window.open('', '_blank', 'width=500,height=320');
    if (!win) return;
    win.document.write(`<html><head><title>DKMerch Rider ID</title><style>body{margin:0;padding:20px;font-family:'Segoe UI',sans-serif;background:#f0f0f0;}</style></head><body>${cardRef.current.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  return (
    <div className="au-rider-view-overlay" onClick={onClose}>
      <div className="au-rider-view-modal" onClick={e => e.stopPropagation()}>
        <button className="au-rider-view-close" onClick={onClose}>&times;</button>
        <h3 className="au-rider-view-title"><i className="fas fa-id-card"></i> Rider Details</h3>
        <p className="au-rider-view-sub">{rider.dkRiderId ? 'Official rider ID card' : 'Rider profile information'}</p>

        <div ref={cardRef}>
          <div className="au-dk-id-card">
            <div className="au-dk-id-header">
              <span className="au-dk-id-logo">🛵</span>
              <div>
                <div className="au-dk-id-brand">DKMerch</div>
                <div className="au-dk-id-brand-sub">Official Delivery Rider</div>
              </div>
            </div>
            <div className="au-dk-id-body">
              {rider.riderPhoto
                ? <img src={rider.riderPhoto} alt={rider.fullName} className="au-dk-id-photo" />
                : <div className="au-dk-id-photo-placeholder">👤</div>}
              <div className="au-dk-id-info">
                <div className="au-dk-id-name">{rider.fullName}</div>
                <div className="au-dk-id-role">Delivery Rider · Motorcycle</div>
                <div className="au-dk-id-details">
                  <div>📞 {rider.phone || '—'}</div>
                  <div>✉️ {rider.email || '—'}</div>
                  {rider.plateNumber && <div>🔢 Plate: {rider.plateNumber}</div>}
                  {rider.licenseNumber && <div>🪪 License: {rider.licenseNumber}</div>}
                  {rider.address && <div>📍 {rider.address}</div>}
                </div>
              </div>
            </div>
            <div className="au-dk-id-footer">
              <div>
                <div className="au-dk-id-number">{rider.dkRiderId || 'Pending ID'}</div>
                <div className="au-dk-id-number-label">Rider ID</div>
              </div>
              <div className="au-dk-id-valid">
                {rider.dkRiderIdGeneratedAt || rider.appliedAt
                  ? new Date(rider.dkRiderIdGeneratedAt || rider.appliedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
                  : '—'}
              </div>
            </div>
          </div>
        </div>

        <div className="au-rider-view-meta">
          <span className={`au-rider-view-status status-${rider.status}`}>{rider.status}</span>
          {rider.vehicleType && <span>Vehicle: Motorcycle</span>}
        </div>

        <div className="au-rider-view-actions">
          {rider.dkRiderId && (
            <button type="button" className="au-btn-secondary" onClick={handlePrint}>
              <i className="fas fa-print"></i> Print ID Card
            </button>
          )}
          <button type="button" className="au-btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
};

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

const RIDER_DELETE_REASONS = [
  { value: 'inactive',          label: 'Account Inactive',     hint: 'Rider has been inactive for a long time' },
  { value: 'policy_violation',  label: 'Policy Violation',     hint: 'Violated DKMerch rider policies' },
  { value: 'request_by_rider',  label: 'Requested by Rider',   hint: 'Rider requested account removal' },
  { value: 'other',             label: 'Other Reason',         hint: 'Specify reason in the note field' },
];

const EMPTY_RIDER_FORM = {
  fullName: '',
  email: '',
  phone: '',
  address: '',
  vehicleType: 'motorcycle',
  plateNumber: '',
  licenseNumber: '',
  password: '',
  confirmPassword: '',
};

const AdminUsers = () => {
  const { confirm } = useConfirm();
  const [activeTab, setActiveTab] = useState('users');

  const users  = useQuery(api.users.getAllUsers)   ?? [];
  const riders = useQuery(api.riders.getAllRiders) ?? [];

  const suspendUserMutation   = useMutation(api.users.suspendUser);
  const unsuspendUserMutation = useMutation(api.users.unsuspendUser);
  const deleteUserMutation    = useMutation(api.users.deleteUser);
  const activateUserMutation  = useMutation(api.users.activateUser);
  const deleteRiderMutation   = useMutation(api.riders.deleteRider);
  const adminCreateRider      = useMutation(api.riders.adminCreateRider);
  const approveRiderMutation  = useMutation(api.riders.approveRider);
  const rejectRiderMutation   = useMutation(api.riders.rejectRiderApplication);
  const sendRiderApprovedEmail = useAction(api.sendEmail.sendRiderApprovedEmail);

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

  const [riderSearch, setRiderSearch]             = useState('');
  const [riderFilterStatus, setRiderFilterStatus] = useState('all');

  const [showRiderDeleteModal, setShowRiderDeleteModal] = useState(false);
  const [riderDeleteStep, setRiderDeleteStep]           = useState(STEP_CONFIGURE);
  const [riderToDelete, setRiderToDelete]               = useState(null);
  const [riderDeleteReason, setRiderDeleteReason]       = useState('');
  const [riderDeleteNote, setRiderDeleteNote]           = useState('');
  const [riderDeleteLoading, setRiderDeleteLoading]     = useState(false);

  const [riderForm, setRiderForm]         = useState(EMPTY_RIDER_FORM);
  const [riderFormError, setRiderFormError] = useState('');
  const [riderFormLoading, setRiderFormLoading] = useState(false);
  const [showRiderPw, setShowRiderPw]     = useState(false);
  const [viewingRider, setViewingRider]   = useState(null);

  const [notification, setNotification] = useState({ show: false, message: '', type: '' });

  const showNotification = (message, type) => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: '' }), 6000);
  };

  const pendingUsers = users.filter(u => u.status === 'pending_activation');
  // regularUsers includes self_deactivated — they're real accounts, not pending
  const regularUsers = users.filter(u => u.status !== 'pending_activation');

  const byNewest = (a, b) =>
    (b._creationTime || new Date(b.appliedAt || b.registeredAt || 0).getTime() || 0) -
    (a._creationTime || new Date(a.appliedAt || a.registeredAt || 0).getTime() || 0);

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
  }).sort(byNewest);

  const filteredPending = pendingUsers.filter(u => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      u.name?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  }).sort(byNewest);

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
  }).sort(byNewest);

  const pendingApplications = riders.filter(r => r.status === 'pending').sort(byNewest);

  const handleRiderFormChange = (e) => {
    const { name, value } = e.target;
    let next = value;
    if (name === 'phone') next = value.replace(/\D/g, '').slice(0, 11);
    if (name === 'password' || name === 'confirmPassword') next = value.slice(0, 10);
    setRiderForm(prev => ({ ...prev, [name]: next }));
    setRiderFormError('');
  };

  const handleAdminCreateRider = async (e) => {
    e.preventDefault();
    setRiderFormError('');
    const { fullName, email, phone, address, plateNumber, licenseNumber, password, confirmPassword } = riderForm;
    if (!fullName.trim() || !email.trim() || !phone.trim() || !password) {
      setRiderFormError('Full name, email, phone, and password are required.');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email.trim())) {
      setRiderFormError('Please enter a valid email address.');
      return;
    }
    if (!password.startsWith('@rider') || password.length < 7 || password.length > 10) {
      setRiderFormError('Password must start with @rider and be 7–10 characters (e.g. @rider1).');
      return;
    }
    if (password !== confirmPassword) {
      setRiderFormError('Passwords do not match.');
      return;
    }

    setRiderFormLoading(true);
    try {
      const result = await adminCreateRider({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        address: address.trim() || undefined,
        vehicleType: 'motorcycle',
        plateNumber: plateNumber.trim() || undefined,
        licenseNumber: licenseNumber.trim() || undefined,
        password,
      });
      if (!result.success) {
        setRiderFormError(result.message || 'Failed to create rider.');
        return;
      }
      try {
        await sendRiderApprovedEmail({
          to: result.email,
          riderName: result.fullName,
          dkRiderId: result.dkRiderId,
          email: result.email,
          vehicleType: 'motorcycle',
          plateNumber: plateNumber.trim() || undefined,
        });
      } catch (mailErr) {
        console.warn('Rider welcome email failed:', mailErr);
      }
      setRiderForm(EMPTY_RIDER_FORM);
      showNotification(`Rider created: ${result.dkRiderId}`, 'success');
      setActiveTab('riders');
      setRiderFilterStatus('approved');
    } catch (err) {
      console.error(err);
      setRiderFormError('Failed to create rider. Please try again.');
    } finally {
      setRiderFormLoading(false);
    }
  };

  const handleApprovePendingRider = async (app) => {
    const ok = await confirm({
      title: 'Approve rider?',
      message: `Approve "${app.fullName}" as a rider?\n\nEmail: ${app.email}`,
      confirmLabel: 'Approve',
      variant: 'primary',
      icon: 'fa-user-check',
    });
    if (!ok) return;
    try {
      const result = await approveRiderMutation({ id: app._id });
      try {
        await sendRiderApprovedEmail({
          to: app.email,
          riderName: app.fullName,
          dkRiderId: result.dkRiderId,
          email: app.email,
          vehicleType: 'motorcycle',
          plateNumber: app.plateNumber,
        });
      } catch (e) { console.warn(e); }
      showNotification(`Approved ${app.fullName} (${result.dkRiderId})`, 'success');
    } catch (err) {
      console.error(err);
      showNotification('Failed to approve rider.', 'error');
    }
  };

  const handleRejectPendingRider = async (app) => {
    const ok = await confirm({
      title: 'Reject application?',
      message: `Reject and delete application for "${app.fullName}"?`,
      confirmLabel: 'Reject',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await rejectRiderMutation({ id: app._id, reason: 'other', note: 'Rejected by admin' });
      showNotification(`Rejected ${app.fullName}`, 'success');
    } catch (err) {
      console.error(err);
      showNotification('Failed to reject application.', 'error');
    }
  };

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

  const getRoleBadgeClass        = (role)   => role === 'admin' ? 'role-badge admin' : 'role-badge user';
  const getRiderStatusBadgeClass = (status) => {
    const map = {
      pending:   'rider-status-badge pending',
      approved:  'rider-status-badge approved',
      rejected:  'rider-status-badge rejected',
      suspended: 'rider-status-badge suspended',
    };
    return map[status] || 'rider-status-badge pending';
  };

  // ── Status badge class — handles self_deactivated ─────────────────────────
  const getStatusBadgeClass = (status) => {
    const s = status || 'active';
    if (s === 'self_deactivated') return 'status-badge self-deactivated';
    if (s === 'deleted')          return 'status-badge deleted';
    return `status-badge ${s}`;
  };

  // ── Status display label + icon ───────────────────────────────────────────
  const getStatusDisplay = (status) => {
    const s = status || 'active';
    switch (s) {
      case 'active':           return { label: 'Active',      icon: 'fa-check-circle' };
      case 'suspended':        return { label: 'Suspended',   icon: 'fa-ban'          };
      case 'self_deactivated': return { label: 'Deactivated', icon: 'fa-pause-circle' };
      case 'deleted':          return { label: 'Deleted',     icon: 'fa-trash-alt'    };
      default:                 return { label: s,             icon: 'fa-circle'       };
    }
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

  const getReasonLabel   = (val) => SUSPEND_REASONS.find(r => r.value === val)?.label || val || '—';
  const getDurationLabel = () => {
    if (suspendDays === null) return 'Permanent';
    if (suspendDays === 1) return '1 Day';
    return `${suspendDays} Days`;
  };

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalUsers        = regularUsers.length;
  const activeUsers       = regularUsers.filter(u => (u.status || 'active') === 'active').length;
  const suspendedUsers    = regularUsers.filter(u => u.status === 'suspended').length;
  const deactivatedUsers  = regularUsers.filter(u => u.status === 'self_deactivated').length;
  const deletedUsers      = regularUsers.filter(u => u.status === 'deleted').length;
  const totalRiders       = riders.length;
  const approvedRiders    = riders.filter(r => r.status === 'approved').length;
  const pendingRiders     = riders.filter(r => r.status === 'pending').length;

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

      {/* ── STATS CARDS ── */}
      <div className="users-stats-row">
        {activeTab === 'riders' || activeTab === 'applications' ? (
          <>
            <div className="au-stat-card">
              <div className="au-stat-icon au-stat-icon--purple"><i className="fas fa-motorcycle"></i></div>
              <div className="au-stat-info">
                <div className="au-stat-label">TOTAL RIDERS</div>
                <div className="au-stat-number">{totalRiders}</div>
                <div className="au-stat-sub">registered riders</div>
              </div>
            </div>
            <div className="au-stat-card">
              <div className="au-stat-icon au-stat-icon--green"><i className="fas fa-check-circle"></i></div>
              <div className="au-stat-info">
                <div className="au-stat-label">APPROVED</div>
                <div className="au-stat-number">{approvedRiders}</div>
                <div className="au-stat-sub">active riders</div>
              </div>
            </div>
            <div className="au-stat-card">
              <div className="au-stat-icon au-stat-icon--yellow"><i className="fas fa-clock"></i></div>
              <div className="au-stat-info">
                <div className="au-stat-label">PENDING</div>
                <div className="au-stat-number">{pendingRiders}</div>
                <div className="au-stat-sub">{pendingRiders === 0 ? 'no pending' : 'awaiting review'}</div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="au-stat-card">
              <div className="au-stat-icon au-stat-icon--green"><i className="fas fa-check-circle"></i></div>
              <div className="au-stat-info">
                <div className="au-stat-label">ACTIVE</div>
                <div className="au-stat-number">{activeUsers}</div>
                <div className="au-stat-sub">active accounts</div>
              </div>
            </div>
            <div className="au-stat-card">
              <div className="au-stat-icon au-stat-icon--red"><i className="fas fa-ban"></i></div>
              <div className="au-stat-info">
                <div className="au-stat-label">SUSPENDED / DELETED</div>
                <div className="au-stat-number">{suspendedUsers + deletedUsers}</div>
                <div className="au-stat-sub">
                  {suspendedUsers > 0 && `${suspendedUsers} suspended`}
                  {suspendedUsers > 0 && deletedUsers > 0 && ' · '}
                  {deletedUsers > 0 && `${deletedUsers} deleted`}
                  {suspendedUsers === 0 && deletedUsers === 0 && 'none'}
                </div>
              </div>
            </div>
            <div className="au-stat-card">
              <div className="au-stat-icon au-stat-icon--yellow"><i className="fas fa-pause-circle"></i></div>
              <div className="au-stat-info">
                <div className="au-stat-label">DEACTIVATED</div>
                <div className="au-stat-number">{deactivatedUsers}</div>
                <div className="au-stat-sub">{deactivatedUsers === 0 ? 'none' : 'self-deactivated'}</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── TABS ── */}
      <div className="tab-switcher">
        <button className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
          <i className="fas fa-user"></i> Users
          <span className="au-tab-badge">{totalUsers}</span>
        </button>
        <button className={`tab-btn ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>
          <i className="fas fa-user-clock"></i> Pending Activation
          <span className="au-tab-badge">{pendingUsers.length}</span>
        </button>
        <button className={`tab-btn ${activeTab === 'riders' ? 'active' : ''}`} onClick={() => setActiveTab('riders')}>
          <i className="fas fa-motorcycle"></i> Riders
          <span className="au-tab-badge">{totalRiders}</span>
        </button>
        <button className={`tab-btn ${activeTab === 'applications' ? 'active' : ''}`} onClick={() => setActiveTab('applications')}>
          <i className="fas fa-id-card"></i> Rider Applications
          <span className="au-tab-badge">{pendingRiders}</span>
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
              {['all', 'active', 'suspended', 'self_deactivated', 'deleted'].map(s => (
                <button key={s} className={`filter-btn ${filterStatus === s ? 'active' : ''}`} onClick={() => setFilterStatus(s)}>
                  {s === 'self_deactivated' ? 'Deactivated' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="users-table-container">
            {filteredUsers.length === 0 ? (
              <div className="no-users"><i className="fas fa-user-slash"></i><p>No users found</p></div>
            ) : (
              <table className="users-table">
                <thead>
                  <tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {filteredUsers.map(user => {
                    const { label: statusLabel, icon: statusIcon } = getStatusDisplay(user.status);
                    const isActive      = (user.status || 'active') === 'active';
                    const isSuspended   = user.status === 'suspended';
                    const isDeactivated = user.status === 'self_deactivated';
                    const isDeleted     = user.status === 'deleted';
                    const isAdmin       = user.email === 'admin' || user.role === 'admin';

                    return (
                      <tr key={user._id}>
                        <td className="user-name"><i className="fas fa-user-circle"></i>{user.name}</td>
                        <td>@{user.username}</td>
                        <td>{user.email}</td>
                        <td>
                          <span className={getRoleBadgeClass(user.role)}>
                            <i className={`fas ${user.role === 'admin' ? 'fa-shield-alt' : 'fa-user'}`}></i>
                            {user.role}
                          </span>
                        </td>
                        <td>
                          <div className="status-cell">
                            <span className={getStatusBadgeClass(user.status)}>
                              <i className={`fas ${statusIcon}`}></i>
                              {statusLabel}
                            </span>

                            {/* Suspended meta chips */}
                            {isSuspended && (
                              <span className="suspend-meta">
                                <span className="suspend-duration-chip">
                                  <i className="fas fa-clock"></i>{getSuspendUntilLabel(user)}
                                </span>
                                {user.suspendReason && (
                                  <span className="suspend-reason-chip">{getReasonLabel(user.suspendReason)}</span>
                                )}
                              </span>
                            )}

                            {/* Deactivated info chip */}
                            {isDeactivated && (
                              <span className="deactivated-chip">
                                <i className="fas fa-info-circle"></i>Self-deactivated · Can reactivate via login
                              </span>
                            )}

                            {/* Deleted info chip */}
                            {isDeleted && (
                              <span className="deleted-chip">
                                <i className="fas fa-trash-alt"></i>Self-deleted · Admin can permanently remove
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="actions-cell">
                          {!isAdmin && (
                            <>
                              {/* Active — can suspend */}
                              {isActive && (
                                <button className="btn-suspend" onClick={() => openSuspendModal(user)} title="Suspend user">
                                  <i className="fas fa-ban"></i>
                                </button>
                              )}

                              {/* Suspended — can unsuspend */}
                              {isSuspended && (
                                <button className="btn-suspend btn-activate"
                                  onClick={() => { setUserToUnsuspend(user); setShowUnsuspendConfirm(true); }}
                                  title="Unsuspend user">
                                  <i className="fas fa-check-circle"></i>
                                </button>
                              )}

                              {/* Deactivated — no admin action, customer reactivates via login OTP */}
                              {isDeactivated && (
                                <span className="au-no-action-tip">
                                  <i className="fas fa-info-circle"></i> Reactivated by customer
                                </span>
                              )}

                              {/* Deleted — remove record permanently */}
                              {isDeleted && (
                                <button className="btn-remove"
                                  onClick={() => { setUserToDelete(user); setShowDeleteConfirm(true); }}
                                  title="Permanently remove record">
                                  <i className="fas fa-trash-alt"></i> Remove
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
                <thead>
                  <tr>
                    <th>Full Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Vehicle</th>
                    <th>Rider ID</th>
                    <th>Status</th>
                    <th>Applied</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRiders.map(rider => (
                    <tr key={rider._id}>
                      <td className="user-name"><i className="fas fa-motorcycle" style={{ color: '#7c3aed' }}></i>{rider.fullName}</td>
                      <td>{rider.email}</td>
                      <td>{rider.phone}</td>
                      <td>Motorcycle</td>
                      <td>
                        {rider.dkRiderId
                          ? <span className="au-rider-id-chip">{rider.dkRiderId}</span>
                          : <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>}
                      </td>
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
                        <button
                          className="btn-suspend btn-activate"
                          onClick={() => setViewingRider(rider)}
                          title="View rider"
                        >
                          <i className="fas fa-eye"></i>
                        </button>
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

      {/* ══ RIDER APPLICATIONS TAB ═════════════════════════════════════════════ */}
      {activeTab === 'applications' && (
        <>
          <div className="au-rider-app-card">
            <div className="au-rider-app-header">
              <div>
                <h3><i className="fas fa-user-plus"></i> Add Rider</h3>
                <p>Admin fills rider details. Account is created as approved and can log in at /rider.</p>
              </div>
            </div>
            <form className="au-rider-app-form" onSubmit={handleAdminCreateRider}>
              <div className="au-rider-form-grid">
                <div className="form-group">
                  <label>Full Name *</label>
                  <input name="fullName" value={riderForm.fullName} onChange={handleRiderFormChange} placeholder="Juan Dela Cruz" required />
                </div>
                <div className="form-group">
                  <label>Email (login) *</label>
                  <input name="email" type="email" value={riderForm.email} onChange={handleRiderFormChange} placeholder="rider@email.com" required />
                </div>
                <div className="form-group">
                  <label>Phone *</label>
                  <input name="phone" value={riderForm.phone} onChange={handleRiderFormChange} placeholder="09XXXXXXXXX" required />
                </div>
                <div className="form-group">
                  <label>Vehicle Type</label>
                  <input value="Motorcycle" disabled readOnly className="au-vehicle-fixed" />
                  <input type="hidden" name="vehicleType" value="motorcycle" />
                </div>
                <div className="form-group">
                  <label>Plate Number</label>
                  <input name="plateNumber" value={riderForm.plateNumber} onChange={handleRiderFormChange} placeholder="ABC 1234" />
                </div>
                <div className="form-group">
                  <label>License Number</label>
                  <input name="licenseNumber" value={riderForm.licenseNumber} onChange={handleRiderFormChange} placeholder="N01-23-456789" />
                </div>
                <div className="form-group au-rider-form-span2">
                  <label>Address</label>
                  <input name="address" value={riderForm.address} onChange={handleRiderFormChange} placeholder="Delivery area / home address" />
                </div>
                <div className="form-group">
                  <label>Password * <span className="au-field-hint">must start with @rider</span></label>
                  <div className="au-pw-row">
                    <input
                      name="password"
                      type={showRiderPw ? 'text' : 'password'}
                      value={riderForm.password}
                      onChange={handleRiderFormChange}
                      placeholder="@rider1"
                      required
                    />
                    <button type="button" className="au-pw-toggle" onClick={() => setShowRiderPw(p => !p)}>
                      <i className={`fas ${showRiderPw ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Confirm Password *</label>
                  <input
                    name="confirmPassword"
                    type={showRiderPw ? 'text' : 'password'}
                    value={riderForm.confirmPassword}
                    onChange={handleRiderFormChange}
                    placeholder="Repeat password"
                    required
                  />
                </div>
              </div>
              {riderFormError && (
                <div className="au-rider-form-error"><i className="fas fa-exclamation-circle"></i> {riderFormError}</div>
              )}
              <div className="au-rider-form-actions">
                <button type="button" className="au-btn-secondary" onClick={() => { setRiderForm(EMPTY_RIDER_FORM); setRiderFormError(''); }} disabled={riderFormLoading}>
                  Clear
                </button>
                <button type="submit" className="au-btn-primary" disabled={riderFormLoading}>
                  {riderFormLoading ? <><i className="fas fa-spinner fa-spin"></i> Creating...</> : <><i className="fas fa-user-check"></i> Create & Approve Rider</>}
                </button>
              </div>
            </form>
          </div>

          <div className="au-rider-pending-block">
            <h4><i className="fas fa-inbox"></i> Pending Applications ({pendingApplications.length})</h4>
            {pendingApplications.length === 0 ? (
              <div className="no-users" style={{ padding: '28px 16px' }}>
                <i className="fas fa-check-circle" style={{ color: '#16a34a' }}></i>
                <p>No pending applications</p>
              </div>
            ) : (
              <div className="users-table-container" style={{ marginTop: 12 }}>
                <table className="users-table">
                  <thead>
                    <tr><th>Full Name</th><th>Email</th><th>Phone</th><th>Vehicle</th><th>Applied</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {pendingApplications.map(app => (
                      <tr key={app._id}>
                        <td className="user-name">{app.fullName}</td>
                        <td>{app.email}</td>
                        <td>{app.phone}</td>
                        <td>Motorcycle</td>
                        <td className="date-cell">{formatDate(app.appliedAt)}</td>
                        <td className="actions-cell">
                          <button className="btn-suspend btn-activate" title="Approve" onClick={() => handleApprovePendingRider(app)}>
                            <i className="fas fa-check-circle"></i>
                          </button>
                          <button className="btn-delete" title="Reject" onClick={() => handleRejectPendingRider(app)}>
                            <i className="fas fa-times-circle"></i>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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

      {/* ══ UNSUSPEND / REACTIVATE CONFIRM ════════════════════════════════════ */}
      {showUnsuspendConfirm && (
        <div className="modal-overlay" onClick={() => setShowUnsuspendConfirm(false)}>
          <div className="modal-content confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="confirm-icon activate"><i className="fas fa-check-circle"></i></div>
            <h2>Unsuspend Account?</h2>
            <p>Restore access for <strong>{userToUnsuspend?.name}</strong>?</p>
            <p className="success-text">They will be able to log in immediately.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowUnsuspendConfirm(false)}>Cancel</button>
              <button className="btn-activate-confirm" onClick={confirmUnsuspend}>
                <i className="fas fa-check-circle"></i> Unsuspend
              </button>
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
            <h2>{userToDelete?.status === 'deleted' ? 'Permanently Remove Record?' : 'Delete User?'}</h2>
            <p>
              {userToDelete?.status === 'deleted'
                ? <>Permanently remove <strong>{userToDelete?.name}</strong>'s record from the database?</>
                : <>Permanently delete <strong>{userToDelete?.name}</strong>?</>
              }
            </p>
            <p className="warning-text">This action cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className="btn-suspend-confirm" onClick={confirmDeleteUser}><i className="fas fa-trash"></i> {userToDelete?.status === 'deleted' ? 'Remove Permanently' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {viewingRider && (
        <RiderViewModal rider={viewingRider} onClose={() => setViewingRider(null)} />
      )}

      {/* ══ RIDER DELETE MODAL ════════════════════════════════════════════════ */}
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