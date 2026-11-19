import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useAction, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useNotification } from '../context/NotificationContext';
import QuickSignInScannerModal from '../components/QuickSignInScannerModal';
import LoggedInDevicesModal from '../components/LoggedInDevicesModal';
import { useCloseOnHistoryBack } from '../hooks/useCloseOnHistoryBack';
import './Settings.css';

const DELETE_REASONS = [
  'I no longer want to use DKMerch',
  'Privacy concerns',
  'I have a duplicate account',
  'Unsatisfied with the service',
  'Other',
];

// ─────────────────────────────────────────────────────────────────────────────
//  DEACTIVATE MODAL — defined OUTSIDE Settings to prevent re-mount on each
//  parent render (which caused the flicker/popup on every keystroke)
// ─────────────────────────────────────────────────────────────────────────────
const DeactivateModal = ({
  user,
  deactStep,     onProceed, onGoBack,
  deactPassword, setDeactPassword,
  deactShowPw,   setDeactShowPw,
  deactLoading,
  deactError,
  onConfirm,
  onClose,
}) => {
  useCloseOnHistoryBack(true, onClose, 'deactivateModal');
  return (
  <div className="settings-modal-overlay" onClick={onClose}>
    <div className="settings-modal" onClick={e => e.stopPropagation()}>

      {/* ── STEP 1: Password entry ── */}
      {deactStep === 1 && (
        <>
          <div className="settings-modal-header" style={{ background: '#f59e0b' }}>
            <div className="settings-modal-icon"><i className="fas fa-lock"></i></div>
            <div className="settings-modal-header-text">
              <h3>Verify Your Identity</h3>
              <p>Enter your password to continue.</p>
            </div>
            <button className="settings-modal-close" onClick={onClose}><i className="fas fa-times"></i></button>
          </div>

          <div className="settings-modal-body">
            <div className="settings-deact-info">
              <i className="fas fa-info-circle"></i>
              <span>
                This is <strong>temporary</strong>. To reactivate, simply log in again —
                we'll send a verification code to <strong>{user?.email}</strong> to confirm your identity.
              </span>
            </div>

            <div className="settings-note-group">
              <label>Confirm with your password</label>
              <div className="settings-pw-input-row">
                <input
                  type={deactShowPw ? 'text' : 'password'}
                  className="settings-pw-input"
                  placeholder="Enter your current password"
                  value={deactPassword}
                  onChange={e => setDeactPassword(e.target.value)}
                  autoFocus
                />
                <button type="button" className="settings-pw-toggle" onClick={() => setDeactShowPw(p => !p)}>
                  <i className={`fas ${deactShowPw ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
            </div>

            {deactError && (
              <div className="settings-modal-error">
                <i className="fas fa-exclamation-circle"></i> {deactError}
              </div>
            )}
          </div>

          <div className="settings-modal-footer">
            <button className="settings-modal-btn-cancel" onClick={onClose}>Cancel</button>
            <button
              className="settings-modal-btn-primary"
              style={{ background: '#f59e0b' }}
              onClick={onProceed}
              disabled={!deactPassword.trim() || deactLoading}
            >
              {deactLoading
                ? <><i className="fas fa-spinner fa-spin"></i> Verifying...</>
                : <>Continue <i className="fas fa-arrow-right"></i></>}
            </button>
          </div>
        </>
      )}

      {/* ── STEP 2: Final confirmation ── */}
      {deactStep === 2 && (
        <>
          <div className="settings-modal-header" style={{ background: '#f59e0b' }}>
            <div className="settings-modal-icon"><i className="fas fa-exclamation-triangle"></i></div>
            <div className="settings-modal-header-text">
              <h3>Confirm Deactivation</h3>
              <p>Please review before confirming.</p>
            </div>
            <button className="settings-modal-close" onClick={onClose} disabled={deactLoading}><i className="fas fa-times"></i></button>
          </div>

          <div className="settings-modal-body">
            <div className="settings-confirm-summary">
              <div className="settings-confirm-row"><span>Account</span><strong>{user?.name}</strong></div>
              <div className="settings-confirm-row"><span>Email</span><strong>{user?.email}</strong></div>
              <div className="settings-confirm-row"><span>Action</span><strong style={{ color: '#f59e0b' }}>Temporary deactivation</strong></div>
            </div>

            <div className="settings-confirm-warning" style={{ borderColor: '#f59e0b', background: '#fef3c712', color: '#92400e' }}>
              <i className="fas fa-exclamation-triangle"></i>
              You will be logged out immediately. To reactivate, log in again — we'll send a verification code to <strong>{user?.email}</strong>.
            </div>

            {deactError && (
              <div className="settings-modal-error">
                <i className="fas fa-exclamation-circle"></i> {deactError}
              </div>
            )}
          </div>

          <div className="settings-modal-footer">
            <button className="settings-modal-btn-cancel" onClick={onGoBack} disabled={deactLoading}>
              <i className="fas fa-arrow-left"></i> Go Back
            </button>
            <button
              className="settings-modal-btn-primary"
              style={{ background: '#f59e0b' }}
              onClick={onConfirm}
              disabled={deactLoading}
            >
              {deactLoading
                ? <><i className="fas fa-spinner fa-spin"></i> Processing...</>
                : <><i className="fas fa-pause-circle"></i> Yes, Deactivate</>}
            </button>
          </div>
        </>
      )}

    </div>
  </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE MODAL — also outside Settings
// ─────────────────────────────────────────────────────────────────────────────
const DeleteModal = ({
  user,
  deleteStep,    setDeleteStep,
  deleteReason,  setDeleteReason,
  deleteNote,    setDeleteNote,
  deletePassword, setDeletePassword,
  deleteShowPw,  setDeleteShowPw,
  deleteLoading,
  deleteError,
  onConfirm,
  onClose,
}) => {
  useCloseOnHistoryBack(true, onClose, 'deleteAccountModal');
  return (
  <div className="settings-modal-overlay" onClick={onClose}>
    <div className="settings-modal" onClick={e => e.stopPropagation()}>

      {deleteStep === 1 && (
        <>
          <div className="settings-modal-header" style={{ background: '#dc2626' }}>
            <div className="settings-modal-icon"><i className="fas fa-trash-alt"></i></div>
            <div className="settings-modal-header-text">
              <h3>Delete Account</h3>
              <p>Scheduled for permanent removal after 30 days.</p>
            </div>
            <button className="settings-modal-close" onClick={onClose}><i className="fas fa-times"></i></button>
          </div>

          <div className="settings-modal-body">
            <p className="settings-modal-label">Why are you deleting your account?</p>
            <div className="settings-reason-list">
              {DELETE_REASONS.map(r => (
                <button
                  key={r}
                  className={`settings-reason-btn ${deleteReason === r ? 'active' : ''}`}
                  style={deleteReason === r ? { borderColor: '#dc2626', background: '#fee2e218', color: '#dc2626' } : {}}
                  onClick={() => setDeleteReason(r)}
                >
                  {deleteReason === r && <i className="fas fa-check-circle" style={{ color: '#dc2626' }}></i>}
                  {r}
                </button>
              ))}
            </div>
            <div className="settings-note-group">
              <label>Additional details <span className="settings-optional">(optional)</span></label>
              <textarea
                className="settings-note-input"
                placeholder="Tell us more..."
                value={deleteNote}
                onChange={e => setDeleteNote(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <div className="settings-modal-footer">
            <button className="settings-modal-btn-cancel" onClick={onClose}>Cancel</button>
            <button
              className="settings-modal-btn-primary"
              style={{ background: '#dc2626' }}
              disabled={!deleteReason}
              onClick={() => setDeleteStep(2)}
            >
              Continue <i className="fas fa-arrow-right"></i>
            </button>
          </div>
        </>
      )}

      {deleteStep === 2 && (
        <>
          <div className="settings-modal-header" style={{ background: '#dc2626' }}>
            <div className="settings-modal-icon"><i className="fas fa-exclamation-circle"></i></div>
            <div className="settings-modal-header-text">
              <h3>Confirm Deletion</h3>
              <p>Please review before confirming.</p>
            </div>
            <button className="settings-modal-close" onClick={onClose}><i className="fas fa-times"></i></button>
          </div>

          <div className="settings-modal-body">
            <div className="settings-confirm-summary">
              <div className="settings-confirm-row"><span>Account</span><strong>{user?.name} ({user?.email})</strong></div>
              <div className="settings-confirm-row"><span>Reason</span><strong>{deleteReason}</strong></div>
              <div className="settings-confirm-row"><span>Action</span><strong style={{ color: '#dc2626' }}>Delete (30-day recovery)</strong></div>
            </div>
            <div className="settings-confirm-warning" style={{ borderColor: '#dc2626', background: '#fee2e212', color: '#991b1b' }}>
              <i className="fas fa-exclamation-circle"></i>
              You’ll be signed out now. You can <strong>recover this account within 30 days</strong> by logging in again and verifying via email OTP. After 30 days it is permanently removed.
            </div>
          </div>

          <div className="settings-modal-footer">
            <button className="settings-modal-btn-cancel" onClick={() => setDeleteStep(1)} disabled={deleteLoading}>
              <i className="fas fa-arrow-left"></i> Go Back
            </button>
            <button
              className="settings-modal-btn-primary"
              style={{ background: '#dc2626' }}
              onClick={() => setDeleteStep(3)}
              disabled={deleteLoading}
            >
              Yes, continue <i className="fas fa-arrow-right"></i>
            </button>
          </div>
        </>
      )}

      {deleteStep === 3 && (
        <>
          <div className="settings-modal-header" style={{ background: '#dc2626' }}>
            <div className="settings-modal-icon"><i className="fas fa-lock"></i></div>
            <div className="settings-modal-header-text">
              <h3>Enter Password</h3>
              <p>Confirm with your password to schedule deletion.</p>
            </div>
            <button className="settings-modal-close" onClick={onClose} disabled={deleteLoading}>
              <i className="fas fa-times"></i>
            </button>
          </div>

          <div className="settings-modal-body">
            <div className="settings-deact-info" style={{ borderColor: '#dc2626', background: '#fee2e212', color: '#991b1b' }}>
              <i className="fas fa-exclamation-circle"></i>
              <span>
                You’ll be logged out. Recover within <strong>30 days</strong> by signing in again with{' '}
                <strong>{user?.email}</strong> and completing email verification. After 30 days, deletion is permanent.
              </span>
            </div>

            <div className="settings-note-group">
              <label>Confirm with your password</label>
              <div className="settings-pw-input-row">
                <input
                  type={deleteShowPw ? 'text' : 'password'}
                  className="settings-pw-input"
                  placeholder="Enter your current password"
                  value={deletePassword}
                  onChange={e => setDeletePassword(e.target.value)}
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter' && deletePassword.trim() && !deleteLoading) onConfirm?.();
                  }}
                />
                <button type="button" className="settings-pw-toggle" onClick={() => setDeleteShowPw(p => !p)}>
                  <i className={`fas ${deleteShowPw ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
            </div>

            {deleteError && (
              <div className="settings-modal-error">
                <i className="fas fa-exclamation-circle"></i> {deleteError}
              </div>
            )}
          </div>

          <div className="settings-modal-footer">
            <button className="settings-modal-btn-cancel" onClick={() => setDeleteStep(2)} disabled={deleteLoading}>
              <i className="fas fa-arrow-left"></i> Go Back
            </button>
            <button
              className="settings-modal-btn-primary"
              style={{ background: '#dc2626' }}
              onClick={onConfirm}
              disabled={!deletePassword.trim() || deleteLoading}
            >
              {deleteLoading
                ? <><i className="fas fa-spinner fa-spin"></i> Deleting...</>
                : <><i className="fas fa-trash-alt"></i> Yes, Delete</>}
            </button>
          </div>
        </>
      )}
    </div>
  </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN SETTINGS COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const Settings = () => {
  const { user, isAuthenticated, isReady, updateUser, logout } = useAuth();
  const { showNotification } = useNotification();
  const navigate = useNavigate();
  const location = useLocation();

  const devicesDeepLinkPending = () => {
    try {
      if (sessionStorage.getItem('dkmerch_open_devices') === '1') return true;
    } catch { /* ignore */ }
    try {
      const q = new URLSearchParams(window.location.search || '');
      return q.get('open') === 'devices' || q.get('tab') === 'manage';
    } catch {
      return false;
    }
  };

  const [activeTab,            setActiveTab]            = useState(() => (devicesDeepLinkPending() ? 'manage' : 'details'));
  const [isForgotPasswordFlow, setIsForgotPasswordFlow] = useState(false);
  const [saving,               setSaving]               = useState(false);
  const [sendingCode,          setSendingCode]          = useState(false);
  const [saveMsg,              setSaveMsg]              = useState('');
  const [codeMsg,              setCodeMsg]              = useState('');

  // ── Modal visibility ──
  const [showDeactModal,  setShowDeactModal]  = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showQuickSignIn, setShowQuickSignIn] = useState(false);
  // Open immediately on mount when notif deep-link set the flag / query
  const [showDevicesModal, setShowDevicesModal] = useState(() => {
    try {
      if (sessionStorage.getItem('dkmerch_open_devices') === '1') return true;
    } catch { /* ignore */ }
    try {
      return new URLSearchParams(window.location.search || '').get('open') === 'devices';
    } catch {
      return false;
    }
  });

  // ── Deactivation state ──
  const [deactStep,     setDeactStep]     = useState(1);
  const [deactPassword, setDeactPassword] = useState('');
  const [deactShowPw,   setDeactShowPw]   = useState(false);
  const [deactLoading,  setDeactLoading]  = useState(false);
  const [deactError,    setDeactError]    = useState('');

  // ── Delete state ──
  const [deleteStep,     setDeleteStep]     = useState(1);
  const [deleteReason,   setDeleteReason]   = useState('');
  const [deleteNote,     setDeleteNote]     = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteShowPw,   setDeleteShowPw]   = useState(false);
  const [deleteLoading,  setDeleteLoading]  = useState(false);
  const [deleteError,    setDeleteError]    = useState('');

  // ── Account details form ──
  const [accountForm, setAccountForm] = useState({ name: '', username: '', email: '', phone: '' });
  const [emailChanged, setEmailChanged] = useState(false);
  const USERNAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
  const usernameChangedAt = Number(user?.usernameChangedAt || 0);
  const usernameCooldownLeftMs = usernameChangedAt > 0
    ? Math.max(0, USERNAME_COOLDOWN_MS - (Date.now() - usernameChangedAt))
    : 0;
  const usernameLocked = usernameCooldownLeftMs > 0;
  const usernameCooldownDays = usernameLocked
    ? Math.max(1, Math.ceil(usernameCooldownLeftMs / (24 * 60 * 60 * 1000)))
    : 0;

  // ── Password form ──
  const [passwordForm, setPasswordForm] = useState({ email: '', verificationCode: '', newPassword: '', confirmPassword: '' });
  const [passwordFocused,     setPasswordFocused]     = useState(false);
  const [showNewPassword,     setShowNewPassword]     = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordValidation,  setPasswordValidation]  = useState({
    minLength: false, hasUppercase: false, hasLowercase: false, hasNumber: false, hasSymbol: false, notReused: true,
  });
  const [sentCode,         setSentCode]         = useState('');
  const [passwordCooldown, setPasswordCooldown] = useState(0);
  const [passwordAttempts, setPasswordAttempts] = useState(0);

  const updateUserProfile     = useMutation(api.users.updateUserProfile);
  const resetPasswordByEmail  = useMutation(api.users.resetPasswordByEmail);
  const sendPasswordResetCode = useAction(api.sendEmail.sendPasswordResetCode);
  const deactivateOwnAccount  = useMutation(api.users.deactivateOwnAccount);
  const softDeleteUser        = useMutation(api.users.softDeleteUser);
  const verifyUserPassword    = useMutation(api.users.verifyUserPassword);
  const approveQuickSignIn    = useMutation(api.quickSignIn.approveSession);
  const accountClosureBlock   = useQuery(
    api.users.getAccountClosureBlock,
    user?._id || user?.id ? { userId: String(user._id || user.id) } : 'skip'
  );
  const closureBlocked = !!accountClosureBlock?.blocked;
  const closureMsg = accountClosureBlock?.message
    || 'You have an active/pending order. Finish or cancel it before deactivating or deleting your account.';

  useEffect(() => {
    const p = passwordForm.newPassword;
    const currentPw = String(user?.password || '');
    setPasswordValidation({
      minLength:    p.length >= 8,
      hasUppercase: /[A-Z]/.test(p),
      hasLowercase: /[a-z]/.test(p),
      hasNumber:    /[0-9]/.test(p),
      hasSymbol:    /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p),
      // When current password is known locally, block reuse in the UI
      notReused:    !p || !currentPw || p !== currentPw,
    });
  }, [passwordForm.newPassword, user?.password]);

  const isPasswordValid = () => Object.values(passwordValidation).every(Boolean);

  const getPasswordStrength = () => {
    const { notReused: _nr, ...rules } = passwordValidation;
    const c = Object.values(rules).filter(Boolean).length;
    if (c === 0) return { text: '', percentage: 0,   color: '' };
    if (c <= 2)  return { text: 'Weak',   percentage: 20,  color: '#dc3545' };
    if (c === 3) return { text: 'Fair',   percentage: 40,  color: '#ffc107' };
    if (c === 4) return { text: 'Good',   percentage: 70,  color: '#17a2b8' };
    return             { text: 'Strong', percentage: 100, color: '#28a745' };
  };

  const strength = getPasswordStrength();
  const passwordsMatch = passwordForm.confirmPassword && passwordForm.newPassword === passwordForm.confirmPassword;
  const showPasswordRequirements = (passwordFocused || passwordForm.newPassword) && !isPasswordValid();

  useEffect(() => {
    const forgotFlag     = localStorage.getItem('dkmerch_forgot_password');
    const forgotPassword = location.state?.forgotPassword;
    const activeTabState = location.state?.activeTab;
    if (forgotFlag === 'true' || forgotPassword) {
      setIsForgotPasswordFlow(true); setActiveTab('password');
      localStorage.removeItem('dkmerch_forgot_password');
      window.history.replaceState({}, document.title); return;
    }
    if (activeTabState === 'password') { setActiveTab('password'); window.history.replaceState({}, document.title); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Sign-in notifications → Account Management + Where you're logged in
  // Wait for auth hydrate on Vercel/PWA — early clean of ?open=devices was dropping the deep-link.
  useEffect(() => {
    if (isForgotPasswordFlow) return;
    if (!isReady || !isAuthenticated) return;

    let openDevices = false;
    let manage = false;
    try {
      if (sessionStorage.getItem('dkmerch_open_devices') === '1') {
        openDevices = true;
        manage = true;
      }
    } catch { /* ignore */ }

    if (location.state?.openDevices) openDevices = true;
    if (location.state?.activeTab === 'manage') manage = true;

    let params;
    try {
      // Prefer live window search — React location.search may already be cleared
      params = new URLSearchParams(window.location.search || location.search || '');
    } catch {
      params = new URLSearchParams();
    }
    if (params.get('tab') === 'manage') manage = true;
    if (params.get('open') === 'devices') openDevices = true;

    if (!manage && !openDevices) return;

    setActiveTab('manage');
    if (openDevices) {
      try { sessionStorage.setItem('dkmerch_open_devices', '1'); } catch { /* ignore */ }
      setShowDevicesModal(true);
    }

    // Keep sessionStorage until modal close. Clean URL after modal is up (not before auth).
    if (location.search || window.location.search || location.state?.openDevices || location.state?.activeTab === 'manage') {
      const t = window.setTimeout(() => {
        if (`${window.location.pathname}${window.location.search}` !== '/settings') {
          navigate('/settings', { replace: true, state: {} });
        }
      }, 400);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [location.search, location.state, isAuthenticated, isReady, isForgotPasswordFlow, navigate]);

  // Notif click while already on Settings (in-app bell / SW postMessage)
  useEffect(() => {
    const onOpenDevices = () => {
      try { sessionStorage.setItem('dkmerch_open_devices', '1'); } catch { /* ignore */ }
      setActiveTab('manage');
      setShowDevicesModal(true);
    };
    window.addEventListener('dkOpenDevices', onOpenDevices);
    return () => window.removeEventListener('dkOpenDevices', onOpenDevices);
  }, []);

  useEffect(() => {
    if (isForgotPasswordFlow) return;
    // Wait for auth hydrate — early !isAuthenticated was kicking /settings deep-links back to Home
    if (!isReady) return;
    if (!isAuthenticated) {
      // Don't bounce away while a devices deep-link is pending (auth still hydrating elsewhere)
      if (devicesDeepLinkPending()) return;
      navigate('/');
      return;
    }
    if (user) setAccountForm({ name: user.name || '', username: user.username || '', email: user.email || '', phone: user.phone || '' });
  }, [user, isAuthenticated, isReady, navigate, isForgotPasswordFlow]);

  // Re-apply devices deep-link after auth is ready (flag survives the brief hydrate gap)
  useEffect(() => {
    if (!isReady || !isAuthenticated || isForgotPasswordFlow) return;
    let open = false;
    try { open = sessionStorage.getItem('dkmerch_open_devices') === '1'; } catch { /* ignore */ }
    if (!open) {
      try {
        const q = new URLSearchParams(window.location.search || location.search || '');
        open = q.get('open') === 'devices' || q.get('tab') === 'manage';
      } catch { /* ignore */ }
    }
    if (!open) return;
    setActiveTab('manage');
    setShowDevicesModal(true);
  }, [isReady, isAuthenticated, isForgotPasswordFlow, location.search]);

  useEffect(() => {
    if (passwordCooldown <= 0) return;
    const t = setTimeout(() => setPasswordCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [passwordCooldown]);

  const handleAccountChange = (e) => {
    const { name, value } = e.target;
    if (name === 'phone') { const d = value.replace(/\D/g, ''); if (d.length > 11) return; setAccountForm(p => ({ ...p, phone: d })); return; }
    if (name === 'email') setEmailChanged(value !== (user?.email || ''));
    setAccountForm(p => ({ ...p, [name]: value }));
  };

  const handlePasswordFormChange = (e) => {
    const { name, value } = e.target;
    if (name === 'verificationCode') { const d = value.replace(/\D/g, ''); if (d.length > 6) return; setPasswordForm(p => ({ ...p, verificationCode: d })); return; }
    setPasswordForm(p => ({ ...p, [name]: value }));
  };

  const handleAccountSubmit = async (e) => {
    e.preventDefault();
    if (!user?._id && !user?.id) { setSaveMsg('❌ User not found.'); return; }
    if (accountForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountForm.email)) { setSaveMsg('❌ Please enter a valid email address.'); return; }
    const nextUsername = (accountForm.username || '').trim();
    const prevUsername = (user?.username || '').trim();
    if (nextUsername && nextUsername.toLowerCase() !== prevUsername.toLowerCase() && usernameLocked) {
      setSaveMsg(`❌ Username can only be changed once every 7 days. Try again in ${usernameCooldownDays} day${usernameCooldownDays === 1 ? '' : 's'}.`);
      return;
    }
    setSaving(true); setSaveMsg('');
    try {
      const uid = user._id || user.id;
      const result = await updateUserProfile({ id: uid, name: accountForm.name, username: accountForm.username, email: accountForm.email, phone: accountForm.phone });
      if (updateUser) {
        await updateUser({
          name: accountForm.name,
          username: result?.username || accountForm.username,
          email: accountForm.email,
          phone: accountForm.phone,
          ...(result?.usernameChangedAt != null ? { usernameChangedAt: result.usernameChangedAt } : {}),
        });
      }
      setEmailChanged(false); setSaveMsg('✅ Account details saved successfully!');
    } catch (err) {
      const msg = err?.data || err?.message || 'Failed to save. Please try again.';
      setSaveMsg(`❌ ${String(msg).replace(/^Error:\s*/i, '')}`);
    }
    finally { setSaving(false); setTimeout(() => setSaveMsg(''), 5000); }
  };

  const handleSendCode = async () => {
    if (passwordCooldown > 0) return;
    const targetEmail = isForgotPasswordFlow ? passwordForm.email : user?.email;
    if (!targetEmail) { setCodeMsg('❌ No email address found.'); return; }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setSentCode(code); setSendingCode(true); setCodeMsg('');
    try {
      const result = await sendPasswordResetCode({ to: targetEmail, code, name: user?.name || undefined });
      if (result?.success) {
        setCodeMsg(`✅ Code sent to ${targetEmail}!`);
        setPasswordCooldown(result.cooldownSec || 30);
        setPasswordAttempts(p => p + 1);
      } else if (result?.rateLimited) {
        const wait = result.waitSec || result.cooldownSec || 30;
        setPasswordCooldown(wait);
        setCodeMsg(`❌ ${result.message || `Please wait ${wait}s before requesting another code.`}`);
        setSentCode('');
      } else {
        setCodeMsg(`❌ Failed: ${result?.message || 'Unknown error'}`);
        setSentCode('');
      }
    } catch { setCodeMsg('❌ Failed to send email.'); setSentCode(''); }
    finally {
      setSendingCode(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault(); setSaveMsg('');
    if (!sentCode)                                  { setSaveMsg('❌ Please request a code first.'); return; }
    if (passwordForm.verificationCode !== sentCode) { setSaveMsg('❌ Invalid verification code.'); return; }
    if (!isPasswordValid())                         { setSaveMsg('❌ Password does not meet requirements.'); return; }
    if (!passwordsMatch)                            { setSaveMsg('❌ Passwords do not match.'); return; }
    // Local guard when current password is known (logged-in change password)
    if (user?.password && passwordForm.newPassword === user.password) {
      setSaveMsg("❌ You can't reuse your current password. Choose a different one.");
      return;
    }
    setSaving(true);
    try {
      const uid = user?._id || user?.id;
      if (isForgotPasswordFlow) {
        const result = await resetPasswordByEmail({
          email: String(passwordForm.email || user?.email || '').trim().toLowerCase(),
          newPassword: passwordForm.newPassword,
        });
        if (!result?.success) {
          setSaveMsg(`❌ ${result?.message || 'Failed to update password.'}`);
          return;
        }
      } else if (uid) {
        await updateUserProfile({ id: uid, password: passwordForm.newPassword });
        if (updateUser) await updateUser({ password: passwordForm.newPassword });
      }
      setSaveMsg('✅ Password updated successfully!');
      setPasswordForm({ email: '', verificationCode: '', newPassword: '', confirmPassword: '' }); setSentCode('');
      if (isForgotPasswordFlow) setTimeout(() => navigate('/'), 1500);
    } catch (err) {
      const raw = String(err?.data || err?.message || err || '');
      const cleaned = raw
        .replace(/^\[CONVEX[^\]]*\]\s*/i, '')
        .replace(/^Uncaught Error:\s*/i, '')
        .replace(/^Error:\s*/i, '')
        .trim();
      if (/reuse|previous password|current password/i.test(cleaned)) {
        setSaveMsg(`❌ ${cleaned}`);
      } else {
        setSaveMsg('❌ Failed to update password.');
      }
    }
    finally { setSaving(false); setTimeout(() => setSaveMsg(''), 5000); }
  };

  // ── Deactivate ────────────────────────────────────────────────────────────
  const openDeact = () => {
    if (closureBlocked) {
      showNotification(closureMsg, 'warning');
      return;
    }
    setDeactStep(1); setDeactPassword(''); setDeactError(''); setDeactShowPw(false);
    setShowDeactModal(true);
  };
  const closeDeact = () => {
    setShowDeactModal(false); setDeactStep(1); setDeactPassword(''); setDeactError(''); setDeactShowPw(false);
  };
  // Called when clicking "Continue" on step 1 — verify password first
  const handleVerifyAndProceed = async () => {
    if (!deactPassword.trim()) { setDeactError('Please enter your password.'); return; }
    setDeactLoading(true); setDeactError('');
    try {
      const uid = user._id || user.id;
      const verified = await verifyUserPassword({ id: uid, password: deactPassword });
      if (!verified.success) { setDeactError('Incorrect password. Please try again.'); return; }
      setDeactStep(2);
    } catch { setDeactError('Failed to verify. Please try again.'); }
    finally { setDeactLoading(false); }
  };

  // Called on step 2 "Yes, Deactivate" — actually deactivate
  const handleDeactivate = async () => {
    setDeactLoading(true); setDeactError('');
    try {
      const uid = user._id || user.id;
      const result = await deactivateOwnAccount({ id: uid, reason: 'self_deactivated', note: undefined });
      if (!result?.success) {
        setDeactError(result?.message || 'Failed to deactivate. Please try again.');
        return;
      }
      logout();
      navigate('/', { replace: true });
    } catch { setDeactError('Failed to deactivate. Please try again.'); }
    finally { setDeactLoading(false); }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const openDelete = () => {
    if (closureBlocked) {
      showNotification(closureMsg, 'warning');
      return;
    }
    setDeleteReason('');
    setDeleteNote('');
    setDeletePassword('');
    setDeleteShowPw(false);
    setDeleteError('');
    setDeleteStep(1);
    setShowDeleteModal(true);
  };
  const closeDelete = () => {
    setShowDeleteModal(false);
    setDeleteReason('');
    setDeleteNote('');
    setDeletePassword('');
    setDeleteShowPw(false);
    setDeleteError('');
    setDeleteStep(1);
  };
  const handleDelete = async () => {
    if (!deletePassword.trim()) {
      setDeleteError('Please enter your password.');
      return;
    }
    setDeleteLoading(true);
    setDeleteError('');
    try {
      const uid = user._id || user.id;
      const verified = await verifyUserPassword({ id: uid, password: deletePassword });
      if (!verified.success) {
        setDeleteError('Incorrect password. Please try again.');
        return;
      }
      const result = await softDeleteUser({
        id: uid,
        reason: deleteReason || 'self_deleted',
        note: deleteNote || undefined,
      });
      if (!result?.success) {
        setDeleteError(result?.message || 'Failed to delete account. Please try again.');
        return;
      }
      logout();
      navigate('/', { replace: true });
    } catch {
      setDeleteError('Failed to delete account. Please try again.');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-container">
        {isForgotPasswordFlow && (
          <div className="settings-header">
            <h1>Reset Password</h1>
            <p>Enter your email and verification code to reset your password</p>
          </div>
        )}

        {!isForgotPasswordFlow && (
          <div className="settings-tabs">
            <button className={`settings-tab ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>
              <i className="fas fa-user"></i> Account Details
            </button>
            <button className={`settings-tab ${activeTab === 'password' ? 'active' : ''}`} onClick={() => setActiveTab('password')}>
              <i className="fas fa-lock"></i> Change Password
            </button>
            <button className={`settings-tab ${activeTab === 'manage' ? 'active' : ''}`} onClick={() => setActiveTab('manage')}>
              <i className="fas fa-shield-alt"></i> Account Management
            </button>
          </div>
        )}

        <div className="settings-content">

          {/* ── ACCOUNT DETAILS ── */}
          {activeTab === 'details' && !isForgotPasswordFlow && (
            <form onSubmit={handleAccountSubmit} className="settings-form">
              <h2>Personal Information</h2>
              <div className="form-group">
                <label>Full Name</label>
                <input type="text" name="name" className="form-control" value={accountForm.name} onChange={handleAccountChange} required />
              </div>
              <div className="form-group">
                <label>Username</label>
                <input
                  type="text"
                  name="username"
                  className="form-control"
                  value={accountForm.username}
                  onChange={handleAccountChange}
                  required
                  disabled={usernameLocked}
                  title={usernameLocked ? `Username locked for ${usernameCooldownDays} more day(s)` : undefined}
                />
                {usernameLocked ? (
                  <small className="email-change-note">
                    <i className="fas fa-clock"></i> Username can be changed again in {usernameCooldownDays} day{usernameCooldownDays === 1 ? '' : 's'} (7-day cooldown).
                  </small>
                ) : (
                  <small>You can change your username once every 7 days.</small>
                )}
              </div>
              <div className="form-group">
                <label>Email Address</label>
                <input type="email" name="email" className="form-control" value={accountForm.email} onChange={handleAccountChange} required />
                {emailChanged && <small className="email-change-note"><i className="fas fa-info-circle"></i> Changing your email will update your login credentials.</small>}
              </div>
              <div className="form-group">
                <label>Phone Number</label>
                <input type="tel" name="phone" className="form-control" placeholder="09XXXXXXXXX" value={accountForm.phone} onChange={handleAccountChange} maxLength="11" />
                <small>Auto-filled from checkout info.</small>
              </div>
              {saveMsg && <div className={`save-message ${saveMsg.startsWith('✅') ? 'success' : 'error'}`}>{saveMsg}</div>}
              <button type="submit" className="btn btn-primary btn-save" disabled={saving}>
                <i className="fas fa-save"></i> {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          )}

          {/* ── PASSWORD ── */}
          {(activeTab === 'password' || isForgotPasswordFlow) && (
            <form onSubmit={handlePasswordSubmit} className="settings-form">
              <h2>{isForgotPasswordFlow ? 'Reset Your Password' : 'Change Password'}</h2>
              <p className="form-description">{isForgotPasswordFlow ? "Enter your email and we'll send you a verification code" : `We'll send a verification code to ${user?.email}`}</p>
              {isForgotPasswordFlow && (
                <div className="form-group">
                  <label>Email Address</label>
                  <input type="email" name="email" className="form-control" placeholder="Enter your registered email" value={passwordForm.email} onChange={handlePasswordFormChange} required />
                </div>
              )}
              <div className="form-group">
                <label>Verification Code</label>
                <div className="input-with-badge">
                  <input type="text" name="verificationCode" className="form-control" placeholder="Enter 6-digit code" value={passwordForm.verificationCode} onChange={handlePasswordFormChange} maxLength="6" required />
                  <button type="button" className="verify-btn" onClick={handleSendCode} disabled={passwordCooldown > 0 || sendingCode}>
                    {sendingCode ? 'Sending...' : passwordCooldown > 0 ? `Wait ${passwordCooldown}s` : 'Send Code'}
                  </button>
                </div>
                {codeMsg && <div className={`save-message ${codeMsg.startsWith('✅') ? 'success' : 'error'}`} style={{ marginTop: '10px' }}>{codeMsg}</div>}
              </div>
              <div className="form-group">
                <label>New Password</label>
                <div className="pw-input-wrapper">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    name="newPassword"
                    className={`form-control pw-input ${isPasswordValid() && passwordForm.newPassword ? 'pw-valid' : ''}`}
                    placeholder="Create a strong password (min. 8 chars)"
                    value={passwordForm.newPassword}
                    onChange={handlePasswordFormChange}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    required
                  />
                  <button type="button" className="pw-toggle-btn" onClick={() => setShowNewPassword(p => !p)}>
                    <i className={`fas ${showNewPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
                {passwordForm.newPassword && (
                  <div className="pw-strength-wrap">
                    <div className="pw-strength-bar"><div className="pw-strength-fill" style={{ width: `${strength.percentage}%`, backgroundColor: strength.color }} /></div>
                    {strength.text && <span className="pw-strength-label" style={{ color: strength.color }}>{strength.text}</span>}
                  </div>
                )}
                {showPasswordRequirements && (
                  <div className="pw-requirements">
                    <div className="pw-req-title">Password must contain:</div>
                    <div className="pw-req-list">
                      {[
                        { key: 'minLength',    label: 'At least 8 characters' },
                        { key: 'hasUppercase', label: 'One uppercase letter' },
                        { key: 'hasLowercase', label: 'One lowercase letter' },
                        { key: 'hasNumber',    label: 'One number' },
                        { key: 'hasSymbol',    label: 'One special character' },
                        { key: 'notReused',    label: 'Different from your current / previous password' },
                      ].map(({ key, label }) => (
                        <div key={key} className={`pw-req-item ${passwordValidation[key] ? 'pw-req-valid' : ''}`}>
                          <i className={`fas ${passwordValidation[key] ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                          <span>{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {isPasswordValid() && passwordForm.newPassword && (
                  <div className="pw-success-msg"><i className="fas fa-check-circle"></i><span>Great! Your password is strong</span></div>
                )}
              </div>
              <div className="form-group">
                <label>Confirm New Password</label>
                <div className="pw-input-wrapper">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    className={`form-control pw-input ${passwordsMatch ? 'pw-valid' : ''}`}
                    placeholder="Re-enter your new password"
                    value={passwordForm.confirmPassword}
                    onChange={handlePasswordFormChange}
                    required
                  />
                  <button type="button" className="pw-toggle-btn" onClick={() => setShowConfirmPassword(p => !p)}>
                    <i className={`fas ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
                {passwordsMatch && <div className="pw-match-msg"><i className="fas fa-check-circle"></i><span>Passwords match!</span></div>}
              </div>
              {saveMsg && <div className={`save-message ${saveMsg.startsWith('✅') ? 'success' : 'error'}`}>{saveMsg}</div>}
              <button type="submit" className="btn btn-primary btn-save" disabled={saving || !isPasswordValid() || !passwordsMatch}>
                <i className="fas fa-key"></i> {saving ? 'Saving...' : isForgotPasswordFlow ? 'Reset Password' : 'Update Password'}
              </button>
              {isForgotPasswordFlow && (
                <button type="button" className="btn btn-save" onClick={() => navigate('/')} style={{ marginTop: '10px', background: '#6c757d', color: 'white' }}>
                  <i className="fas fa-arrow-left"></i> Back to Login
                </button>
              )}
            </form>
          )}

          {/* ── ACCOUNT MANAGEMENT ── */}
          {activeTab === 'manage' && !isForgotPasswordFlow && (
            <div className="settings-form">
              <h2>Account Management</h2>
              <p className="form-description">Manage your account status. These actions will log you out immediately.</p>

              <div className="settings-acct-card settings-acct-card--qsi">
                <div className="settings-acct-card-icon"><i className="fas fa-qrcode"></i></div>
                <div className="settings-acct-card-info">
                  <h4>Quick Sign In</h4>
                  <p>Use this on your phone to approve desktop login — scan the desktop QR or type the ABCD-EFGH code. QR is not generated on mobile.</p>
                </div>
                <button
                  type="button"
                  className="settings-acct-btn settings-acct-btn--qsi"
                  onClick={() => setShowQuickSignIn(true)}
                >
                  Scan QR
                </button>
              </div>

              <div className="settings-acct-card settings-acct-card--devices">
                <div className="settings-acct-card-icon"><i className="fas fa-laptop"></i></div>
                <div className="settings-acct-card-info">
                  <h4>Where you’re logged in</h4>
                  <p>See every device using your account. Log out one device or all devices anytime.</p>
                </div>
                <button
                  type="button"
                  className="settings-acct-btn settings-acct-btn--devices"
                  onClick={() => setShowDevicesModal(true)}
                >
                  View devices
                </button>
              </div>

              {closureBlocked && (
                <div className="settings-closure-block-banner" role="status">
                  <i className="fas fa-ban" aria-hidden="true"></i>
                  <div>
                    <strong>Deactivate / Delete unavailable</strong>
                    <p>{closureMsg}</p>
                  </div>
                </div>
              )}

              <div className={`settings-acct-card settings-acct-card--warn${closureBlocked ? ' is-blocked' : ''}`}>
                <div className="settings-acct-card-icon"><i className="fas fa-pause-circle"></i></div>
                <div className="settings-acct-card-info">
                  <h4>Deactivate Account</h4>
                  <p>Temporarily suspend your account. You can reactivate anytime by logging in again — we'll verify your identity via email OTP.</p>
                  {closureBlocked && (
                    <span className="settings-closure-lock-chip">
                      <i className="fas fa-lock"></i> Not allowed while you have pending orders
                    </span>
                  )}
                </div>
                <button
                  className="settings-acct-btn settings-acct-btn--warn"
                  onClick={openDeact}
                  disabled={closureBlocked}
                  title={closureBlocked ? closureMsg : 'Deactivate account'}
                >
                  {closureBlocked ? 'Unavailable' : 'Deactivate'}
                </button>
              </div>

              <div className={`settings-acct-card settings-acct-card--danger${closureBlocked ? ' is-blocked' : ''}`}>
                <div className="settings-acct-card-icon"><i className="fas fa-trash-alt"></i></div>
                <div className="settings-acct-card-info">
                  <h4>Delete Account</h4>
                  <p>Schedule account deletion. You can recover it within 30 days by logging in again; after that it’s permanently removed.</p>
                  {closureBlocked && (
                    <span className="settings-closure-lock-chip">
                      <i className="fas fa-lock"></i> Not allowed while you have pending orders
                    </span>
                  )}
                </div>
                <button
                  className="settings-acct-btn settings-acct-btn--danger"
                  onClick={openDelete}
                  disabled={closureBlocked}
                  title={closureBlocked ? closureMsg : 'Delete account'}
                >
                  {closureBlocked ? 'Unavailable' : 'Delete'}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── MODALS — rendered at root level, not inside a re-rendering subtree ── */}
      {showDeactModal && (
        <DeactivateModal
          user={user}
          deactStep={deactStep}
          onProceed={handleVerifyAndProceed}
          onGoBack={() => setDeactStep(1)}
          deactPassword={deactPassword}
          setDeactPassword={setDeactPassword}
          deactShowPw={deactShowPw}
          setDeactShowPw={setDeactShowPw}
          deactLoading={deactLoading}
          deactError={deactError}
          onConfirm={handleDeactivate}
          onClose={closeDeact}
        />
      )}

      {showDeleteModal && (
        <DeleteModal
          user={user}
          deleteStep={deleteStep}
          setDeleteStep={setDeleteStep}
          deleteReason={deleteReason}
          setDeleteReason={setDeleteReason}
          deleteNote={deleteNote}
          setDeleteNote={setDeleteNote}
          deletePassword={deletePassword}
          setDeletePassword={setDeletePassword}
          deleteShowPw={deleteShowPw}
          setDeleteShowPw={setDeleteShowPw}
          deleteLoading={deleteLoading}
          deleteError={deleteError}
          onConfirm={handleDelete}
          onClose={closeDelete}
        />
      )}

      {showQuickSignIn && (
        <QuickSignInScannerModal
          onClose={() => setShowQuickSignIn(false)}
          accountLabel={user?.name || user?.email || 'this account'}
          onScan={async (token) => {
            const result = await approveQuickSignIn({
              token,
              email: user?.email || '',
            });
            if (result?.success) {
              showNotification('Desktop login approved — that browser is signing in now.', 'success');
            }
            return result;
          }}
        />
      )}

      {showDevicesModal && (
        <LoggedInDevicesModal
          userId={user?._id || user?.id}
          currentSessionId={user?.sessionId}
          onClose={() => {
            try { sessionStorage.removeItem('dkmerch_open_devices'); } catch { /* ignore */ }
            setShowDevicesModal(false);
            if (location.search) navigate('/settings', { replace: true, state: {} });
          }}
          onLogoutCurrent={() => {
            try { sessionStorage.removeItem('dkmerch_open_devices'); } catch { /* ignore */ }
            try { logout?.(); } catch { /* ignore */ }
            navigate('/');
          }}
        />
      )}
    </div>
  );
};

export default Settings;