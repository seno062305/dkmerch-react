import React, { useEffect, useState } from 'react';
import { useMutation, useAction, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from '../context/ConfirmContext';
import QuickSignInScannerModal from '../components/QuickSignInScannerModal';
import LoggedInDevicesModal from '../components/LoggedInDevicesModal';
import '../pages/Settings.css';
import './AdminBackup.css';
import './AdminStoreDetails.css';

const USERNAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

const AdminStoreDetails = () => {
  const { user, updateUser } = useAuth();
  const { showNotification } = useNotification();
  const { confirm } = useConfirm();
  const [activeTab, setActiveTab] = useState('store');

  const storeSettings = useQuery(api.settings.getSettings);
  const updateSettings = useMutation(api.settings.updateSettings);
  const updateUserProfile = useMutation(api.users.updateUserProfile);
  const resetPasswordByEmail = useMutation(api.users.resetPasswordByEmail);
  const sendPasswordResetCode = useAction(api.sendEmail.sendPasswordResetCode);
  const approveQuickSignIn = useMutation(api.quickSignIn.approveSession);

  const [accountForm, setAccountForm] = useState({
    username: '',
    email: '',
    phone: '',
  });
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountMsg, setAccountMsg] = useState('');

  const [storeForm, setStoreForm] = useState({
    storeName: '',
    storeAddress: '',
    storeLat: '',
    storeLng: '',
    shippingBaseFare: '49',
  });
  const [storeFormSaved, setStoreFormSaved] = useState(false);
  const [shippingSaved, setShippingSaved] = useState(false);
  const [shippingSaving, setShippingSaving] = useState(false);
  const [storeLocating, setStoreLocating] = useState(false);

  const [passwordForm, setPasswordForm] = useState({
    verificationCode: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [sentCode, setSentCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [codeMsg, setCodeMsg] = useState('');
  const [passwordCooldown, setPasswordCooldown] = useState(0);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [passwordValidation, setPasswordValidation] = useState({
    minLength: false,
    hasUppercase: false,
    hasLowercase: false,
    hasNumber: false,
    hasSymbol: false,
    notReused: true,
  });

  const [showQuickSignIn, setShowQuickSignIn] = useState(false);
  const [showDevicesModal, setShowDevicesModal] = useState(false);

  useEffect(() => {
    if (!user) return;
    setAccountForm({
      username: user.username || '',
      email: user.email || '',
      phone: user.phone || '',
    });
  }, [user]);

  useEffect(() => {
    if (!storeSettings) return;
    setStoreForm({
      storeName: storeSettings.storeName ?? 'DKMerch Store',
      storeAddress: storeSettings.storeAddress ?? '',
      storeLat: storeSettings.storeLat != null ? String(storeSettings.storeLat) : '',
      storeLng: storeSettings.storeLng != null ? String(storeSettings.storeLng) : '',
      shippingBaseFare:
        storeSettings.shippingBaseFare != null
          ? String(storeSettings.shippingBaseFare)
          : '49',
    });
  }, [storeSettings]);

  useEffect(() => {
    if (passwordCooldown <= 0) return undefined;
    const t = setInterval(() => setPasswordCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [passwordCooldown]);

  useEffect(() => {
    const p = passwordForm.newPassword;
    const currentPw = String(user?.password || '');
    setPasswordValidation({
      minLength: p.length >= 8,
      hasUppercase: /[A-Z]/.test(p),
      hasLowercase: /[a-z]/.test(p),
      hasNumber: /[0-9]/.test(p),
      hasSymbol: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p),
      notReused: !p || !currentPw || p !== currentPw,
    });
  }, [passwordForm.newPassword, user?.password]);

  const usernameChangedAt = Number(user?.usernameChangedAt || 0);
  const usernameCooldownLeftMs = usernameChangedAt > 0
    ? Math.max(0, USERNAME_COOLDOWN_MS - (Date.now() - usernameChangedAt))
    : 0;
  const usernameLocked = usernameCooldownLeftMs > 0;
  const usernameCooldownDays = usernameLocked
    ? Math.max(1, Math.ceil(usernameCooldownLeftMs / (24 * 60 * 60 * 1000)))
    : 0;

  const isPasswordValid = () => Object.values(passwordValidation).every(Boolean);
  const passwordsMatch =
    passwordForm.confirmPassword
    && passwordForm.newPassword === passwordForm.confirmPassword;

  const handleAccountChange = (e) => {
    const { name, value } = e.target;
    setAccountForm((prev) => ({ ...prev, [name]: value }));
    setAccountMsg('');
  };

  const handleSaveAccount = async (e) => {
    e.preventDefault();
    const uid = user?._id || user?.id;
    if (!uid) return;
    const ok = await confirm({
      title: 'Save account details?',
      message: 'Save username, email, and contact number for this admin account?',
      confirmLabel: 'Save',
      cancelLabel: 'Cancel',
      variant: 'warning',
      icon: 'fa-save',
    });
    if (!ok) return;
    setAccountSaving(true);
    setAccountMsg('');
    try {
      const result = await updateUserProfile({
        id: uid,
        username: accountForm.username.trim() || undefined,
        email: accountForm.email.trim() || undefined,
        phone: accountForm.phone.trim() || undefined,
      });
      if (result?.success) {
        updateUser?.({
          ...user,
          username: result.username || accountForm.username,
          email: accountForm.email.trim(),
          phone: accountForm.phone.trim(),
          usernameChangedAt: result.usernameChangedAt ?? user.usernameChangedAt,
        });
        setAccountMsg('✅ Store account details saved.');
        showNotification('Account details saved.', 'success');
      } else {
        setAccountMsg('❌ Failed to save.');
      }
    } catch (err) {
      setAccountMsg(`❌ ${err?.data || err?.message || 'Failed to save.'}`);
    } finally {
      setAccountSaving(false);
      setTimeout(() => setAccountMsg(''), 5000);
    }
  };

  const handleStoreFormChange = (e) => {
    const { name, value } = e.target;
    setStoreForm((prev) => ({ ...prev, [name]: value }));
    setStoreFormSaved(false);
    if (name === 'shippingBaseFare') setShippingSaved(false);
  };

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      showNotification('Geolocation is not supported by your browser.', 'error');
      return;
    }
    setStoreLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
            { headers: { 'Accept-Language': 'en' } }
          );
          const data = await res.json();
          setStoreForm((prev) => ({
            ...prev,
            storeLat: String(lat),
            storeLng: String(lng),
            storeAddress: data.display_name || prev.storeAddress,
          }));
          setStoreFormSaved(false);
        } catch {
          setStoreForm((prev) => ({ ...prev, storeLat: String(lat), storeLng: String(lng) }));
        } finally {
          setStoreLocating(false);
        }
      },
      () => {
        showNotification('Unable to detect location.', 'error');
        setStoreLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handleSaveStoreSettings = async () => {
    const lat = parseFloat(storeForm.storeLat);
    const lng = parseFloat(storeForm.storeLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      showNotification('Please enter valid coordinates or use Detect Location.', 'warning');
      return;
    }
    const ok = await confirm({
      title: 'Save store location?',
      message: `Save pickup location for “${storeForm.storeName || 'DKMerch Store'}”?\n\n${storeForm.storeAddress || 'No address set'}`,
      confirmLabel: 'Save Location',
      cancelLabel: 'Cancel',
      variant: 'warning',
      icon: 'fa-map-marker-alt',
    });
    if (!ok) return;
    try {
      await updateSettings({
        storeName: storeForm.storeName || undefined,
        storeAddress: storeForm.storeAddress || undefined,
        storeLat: lat,
        storeLng: lng,
      });
      setStoreFormSaved(true);
      showNotification('Store location saved.', 'success');
    } catch (err) {
      console.error(err);
      showNotification('Failed to save store location.', 'error');
    }
  };

  const handleSaveShippingFee = async () => {
    const fare = Math.round(Number(storeForm.shippingBaseFare));
    if (!Number.isFinite(fare) || fare < 0) {
      showNotification('Enter a valid shipping fee (₱0 or more).', 'warning');
      return;
    }
    const prev =
      storeSettings?.shippingBaseFare != null
        ? Number(storeSettings.shippingBaseFare)
        : 49;
    if (fare === prev) {
      showNotification('Shipping fee is unchanged.', 'info');
      return;
    }
    const ok = await confirm({
      title: 'Update shipping fee?',
      message: `Change base shipping fee from ₱${prev.toLocaleString('en-PH')} to ₱${fare.toLocaleString('en-PH')}?\n\nAll customers will get an in-app notification.`,
      confirmLabel: 'Save & Notify',
      cancelLabel: 'Cancel',
      variant: 'warning',
      icon: 'fa-truck',
    });
    if (!ok) return;
    setShippingSaving(true);
    try {
      const res = await updateSettings({
        shippingBaseFare: fare,
        notifyShippingChange: true,
      });
      setShippingSaved(true);
      showNotification(
        `Shipping fee saved. Notified ${res?.notified ?? 0} customer(s).`,
        'success'
      );
    } catch (err) {
      console.error(err);
      showNotification('Failed to save shipping fee.', 'error');
    } finally {
      setShippingSaving(false);
    }
  };

  const handleSendCode = async () => {
    if (passwordCooldown > 0) return;
    const targetEmail = user?.email;
    if (!targetEmail) {
      setCodeMsg('❌ No email address found.');
      return;
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setSentCode(code);
    setSendingCode(true);
    setCodeMsg('');
    try {
      const result = await sendPasswordResetCode({
        to: targetEmail,
        code,
        name: user?.name || user?.username || undefined,
      });
      if (result?.success) {
        setCodeMsg(`✅ Code sent to ${targetEmail}!`);
        setPasswordCooldown(result.cooldownSec || 30);
      } else if (result?.rateLimited) {
        const wait = result.waitSec || result.cooldownSec || 30;
        setPasswordCooldown(wait);
        setCodeMsg(`❌ ${result.message || `Please wait ${wait}s before requesting another code.`}`);
        setSentCode('');
      } else {
        setCodeMsg(`❌ Failed: ${result?.message || 'Unknown error'}`);
        setSentCode('');
      }
    } catch {
      setCodeMsg('❌ Failed to send email.');
      setSentCode('');
    } finally {
      setSendingCode(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordMsg('');
    if (!sentCode) {
      setPasswordMsg('❌ Please request a code first (Send OTP).');
      return;
    }
    if (passwordForm.verificationCode !== sentCode) {
      setPasswordMsg('❌ Invalid verification code.');
      return;
    }
    if (!isPasswordValid()) {
      setPasswordMsg('❌ Password does not meet requirements.');
      return;
    }
    if (!passwordsMatch) {
      setPasswordMsg('❌ Passwords do not match.');
      return;
    }
    setPasswordSaving(true);
    try {
      const result = await resetPasswordByEmail({
        email: user.email,
        newPassword: passwordForm.newPassword,
      });
      if (result?.success) {
        updateUser?.({ ...user, password: passwordForm.newPassword });
        setPasswordMsg('✅ Password updated.');
        setPasswordForm({ verificationCode: '', newPassword: '', confirmPassword: '' });
        setSentCode('');
        showNotification('Password updated.', 'success');
      } else {
        setPasswordMsg(`❌ ${result?.message || 'Failed to update password.'}`);
      }
    } catch (err) {
      setPasswordMsg(`❌ ${err?.message || 'Failed to update password.'}`);
    } finally {
      setPasswordSaving(false);
      setTimeout(() => setPasswordMsg(''), 5000);
    }
  };

  return (
    <div className="admin-store-details">
      <div className="ab-super-top" style={{ marginBottom: 16 }}>
        <div>
          <h1>Store Details</h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
            Store location, shipping, and admin account
          </p>
        </div>
      </div>

      <div className="asd-settings-panel">
        <div className="settings-tabs">
          <button
            type="button"
            className={`settings-tab ${activeTab === 'store' ? 'active' : ''}`}
            onClick={() => setActiveTab('store')}
          >
            <i className="fas fa-store"></i> Store Details
          </button>
          <button
            type="button"
            className={`settings-tab ${activeTab === 'password' ? 'active' : ''}`}
            onClick={() => setActiveTab('password')}
          >
            <i className="fas fa-lock"></i> Change Password
          </button>
          <button
            type="button"
            className={`settings-tab ${activeTab === 'manage' ? 'active' : ''}`}
            onClick={() => setActiveTab('manage')}
          >
            <i className="fas fa-shield-alt"></i> Account Management
          </button>
        </div>

        <div className="settings-content">
          {activeTab === 'store' && (
            <>
              <form onSubmit={handleSaveAccount} className="settings-form">
                <h2>Store Details</h2>
                <p className="form-description">Admin login username, email, and contact number.</p>
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
                  />
                  {usernameLocked ? (
                    <small className="email-change-note">
                      <i className="fas fa-clock"></i> Username can be changed again in {usernameCooldownDays} day{usernameCooldownDays === 1 ? '' : 's'}.
                    </small>
                  ) : (
                    <small>You can change your username once every 7 days.</small>
                  )}
                </div>
                <div className="form-group">
                  <label>Email Address</label>
                  <input
                    type="email"
                    name="email"
                    className="form-control"
                    value={accountForm.email}
                    onChange={handleAccountChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Contact Number</label>
                  <input
                    type="tel"
                    name="phone"
                    className="form-control"
                    placeholder="09XXXXXXXXX"
                    value={accountForm.phone}
                    onChange={handleAccountChange}
                    maxLength={11}
                  />
                </div>
                {accountMsg && (
                  <div className={`save-message ${accountMsg.startsWith('✅') ? 'success' : 'error'}`}>
                    {accountMsg}
                  </div>
                )}
                <button type="submit" className="btn btn-primary btn-save" disabled={accountSaving}>
                  <i className="fas fa-save"></i> {accountSaving ? 'Saving…' : 'Save Account Details'}
                </button>
              </form>

              <div className="ab-store-shipping-row" style={{ marginTop: 20 }}>
                <div className="ab-card">
                  <div className="ab-card-title">
                    <i className="fas fa-map-marker-alt" style={{ background: '#fff1f5', color: '#fc1268' }}></i>
                    <h3>Store / Pickup Location</h3>
                  </div>
                  <div className="ab-store-grid">
                    <div className="ab-store-field">
                      <label className="ab-password-label" htmlFor="asd-store-name">Store Name</label>
                      <input
                        id="asd-store-name"
                        className="ab-oracle-input"
                        type="text"
                        name="storeName"
                        value={storeForm.storeName}
                        onChange={handleStoreFormChange}
                        placeholder="DKMerch Store"
                      />
                    </div>
                    <div className="ab-store-field">
                      <label className="ab-password-label" htmlFor="asd-store-address">Store Address</label>
                      <input
                        id="asd-store-address"
                        className="ab-oracle-input"
                        type="text"
                        name="storeAddress"
                        value={storeForm.storeAddress}
                        onChange={handleStoreFormChange}
                        placeholder="Full store address"
                      />
                    </div>
                    <div className="ab-store-field">
                      <label className="ab-password-label" htmlFor="asd-store-lat">Latitude</label>
                      <input
                        id="asd-store-lat"
                        className="ab-oracle-input"
                        type="number"
                        name="storeLat"
                        value={storeForm.storeLat}
                        onChange={handleStoreFormChange}
                        step="0.00001"
                      />
                    </div>
                    <div className="ab-store-field">
                      <label className="ab-password-label" htmlFor="asd-store-lng">Longitude</label>
                      <input
                        id="asd-store-lng"
                        className="ab-oracle-input"
                        type="number"
                        name="storeLng"
                        value={storeForm.storeLng}
                        onChange={handleStoreFormChange}
                        step="0.00001"
                      />
                    </div>
                  </div>
                  <div className="ab-store-actions">
                    <button
                      type="button"
                      className="ab-btn-outline"
                      onClick={handleDetectLocation}
                      disabled={storeLocating}
                    >
                      <i className={storeLocating ? 'fas fa-spinner fa-spin' : 'fas fa-crosshairs'}></i>{' '}
                      {storeLocating ? 'Detecting…' : 'Detect My Location'}
                    </button>
                    <button
                      type="button"
                      className="ab-btn-primary"
                      onClick={handleSaveStoreSettings}
                      style={storeFormSaved ? { background: '#16a34a' } : undefined}
                    >
                      <i className={storeFormSaved ? 'fas fa-check' : 'fas fa-save'}></i>{' '}
                      {storeFormSaved ? 'Saved!' : 'Save Location'}
                    </button>
                  </div>
                </div>

                <div className="ab-card">
                  <div className="ab-card-title">
                    <i className="fas fa-truck" style={{ background: '#eff6ff', color: '#2563eb' }}></i>
                    <h3>Shipping Fee</h3>
                  </div>
                  <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: 13, lineHeight: 1.45 }}>
                    Base delivery fare used at checkout. Saving a new amount notifies customers in-app.
                  </p>
                  <div className="ab-store-grid">
                    <div className="ab-store-field">
                      <label className="ab-password-label" htmlFor="asd-shipping-base">
                        Base shipping fee (₱)
                      </label>
                      <input
                        id="asd-shipping-base"
                        className="ab-oracle-input"
                        type="number"
                        name="shippingBaseFare"
                        min="0"
                        step="1"
                        value={storeForm.shippingBaseFare}
                        onChange={handleStoreFormChange}
                        placeholder="49"
                      />
                    </div>
                  </div>
                  <div className="ab-store-actions">
                    <button
                      type="button"
                      className="ab-btn-primary"
                      onClick={handleSaveShippingFee}
                      disabled={shippingSaving}
                      style={shippingSaved ? { background: '#16a34a' } : undefined}
                    >
                      <i
                        className={
                          shippingSaving
                            ? 'fas fa-spinner fa-spin'
                            : shippingSaved
                              ? 'fas fa-check'
                              : 'fas fa-save'
                        }
                      ></i>{' '}
                      {shippingSaving
                        ? 'Saving…'
                        : shippingSaved
                          ? 'Saved & notified!'
                          : 'Save Shipping Fee'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="settings-form">
              <h2>Change Password</h2>
              <p className="form-description">
                We&apos;ll send an OTP to <strong>{user?.email}</strong>. Enter it below, then set a new password.
              </p>
              <div className="form-group">
                <label>Verification Code (OTP)</label>
                <div className="input-with-badge">
                  <input
                    type="text"
                    name="verificationCode"
                    className="form-control"
                    placeholder="Enter 6-digit code"
                    value={passwordForm.verificationCode}
                    onChange={(e) => setPasswordForm((p) => ({ ...p, verificationCode: e.target.value }))}
                    maxLength={6}
                    required
                  />
                  <button
                    type="button"
                    className="verify-btn"
                    onClick={handleSendCode}
                    disabled={passwordCooldown > 0 || sendingCode}
                  >
                    {sendingCode ? 'Sending…' : passwordCooldown > 0 ? `Wait ${passwordCooldown}s` : 'Send OTP'}
                  </button>
                </div>
                {codeMsg && (
                  <div className={`save-message ${codeMsg.startsWith('✅') ? 'success' : 'error'}`} style={{ marginTop: 10 }}>
                    {codeMsg}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>New Password</label>
                <div className="pw-input-wrapper">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    className={`form-control pw-input ${isPasswordValid() && passwordForm.newPassword ? 'pw-valid' : ''}`}
                    placeholder="Min. 8 chars with upper, lower, number, symbol"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    required
                  />
                  <button type="button" className="pw-toggle-btn" onClick={() => setShowNewPassword((v) => !v)}>
                    <i className={`fas ${showNewPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
                {(passwordFocused || passwordForm.newPassword) && !isPasswordValid() && (
                  <ul className="pw-requirements" style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                    <li style={{ color: passwordValidation.minLength ? '#16a34a' : undefined }}>At least 8 characters</li>
                    <li style={{ color: passwordValidation.hasUppercase ? '#16a34a' : undefined }}>Uppercase letter</li>
                    <li style={{ color: passwordValidation.hasLowercase ? '#16a34a' : undefined }}>Lowercase letter</li>
                    <li style={{ color: passwordValidation.hasNumber ? '#16a34a' : undefined }}>Number</li>
                    <li style={{ color: passwordValidation.hasSymbol ? '#16a34a' : undefined }}>Symbol</li>
                    <li style={{ color: passwordValidation.notReused ? '#16a34a' : undefined }}>Not your current password</li>
                  </ul>
                )}
              </div>
              <div className="form-group">
                <label>Confirm New Password</label>
                <div className="pw-input-wrapper">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    className={`form-control pw-input ${passwordsMatch ? 'pw-valid' : ''}`}
                    placeholder="Re-enter new password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                    required
                  />
                  <button type="button" className="pw-toggle-btn" onClick={() => setShowConfirmPassword((v) => !v)}>
                    <i className={`fas ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </div>
              {passwordMsg && (
                <div className={`save-message ${passwordMsg.startsWith('✅') ? 'success' : 'error'}`}>
                  {passwordMsg}
                </div>
              )}
              <button
                type="submit"
                className="btn btn-primary btn-save"
                disabled={passwordSaving || !isPasswordValid() || !passwordsMatch}
              >
                <i className="fas fa-key"></i> {passwordSaving ? 'Saving…' : 'Update Password'}
              </button>
            </form>
          )}

          {activeTab === 'manage' && (
            <div className="settings-form">
              <h2>Account Management</h2>
              <p className="form-description">Quick Sign In and devices for this admin account.</p>

              <div className="settings-acct-card settings-acct-card--qsi">
                <div className="settings-acct-card-icon"><i className="fas fa-qrcode"></i></div>
                <div className="settings-acct-card-info">
                  <h4>Quick Sign In</h4>
                  <p>
                    On your phone (logged in as admin), scan the desktop Login → Quick Sign In QR
                    or type the code to sign that computer into this admin account.
                  </p>
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
                  <h4>Where you&apos;re logged in</h4>
                  <p>See devices using this admin account. Log out one or all anytime.</p>
                </div>
                <button
                  type="button"
                  className="settings-acct-btn settings-acct-btn--devices"
                  onClick={() => setShowDevicesModal(true)}
                >
                  View devices
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showQuickSignIn && (
        <QuickSignInScannerModal
          onClose={() => setShowQuickSignIn(false)}
          accountLabel={user?.username || user?.email || 'admin'}
          onScan={async (token) => {
            const result = await approveQuickSignIn({
              token,
              email: String(user?.email || ''),
            });
            return result;
          }}
        />
      )}
      {showDevicesModal && (
        <LoggedInDevicesModal
          userId={user?._id || user?.id}
          currentSessionId={user?.sessionId}
          onClose={() => setShowDevicesModal(false)}
        />
      )}
    </div>
  );
};

export default AdminStoreDetails;
