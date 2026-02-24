import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import './Settings.css';

const Settings = () => {
  const { user, isAuthenticated, updateUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState('details');
  const [isForgotPasswordFlow, setIsForgotPasswordFlow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [codeMsg, setCodeMsg] = useState('');

  const [accountForm, setAccountForm] = useState({
    name: '', username: '', email: '', phone: '',
  });
  const [emailChanged, setEmailChanged] = useState(false);

  const [passwordForm, setPasswordForm] = useState({
    email: '',
    verificationCode: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [passwordFocused, setPasswordFocused] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordValidation, setPasswordValidation] = useState({
    minLength: false,
    hasUppercase: false,
    hasLowercase: false,
    hasNumber: false,
    hasSymbol: false,
  });

  const [sentCode, setSentCode] = useState('');
  const [passwordCooldown, setPasswordCooldown] = useState(0);
  const [passwordAttempts, setPasswordAttempts] = useState(0);

  const updateUserProfile = useMutation(api.users.updateUserProfile);
  const updatePassword = useMutation(api.users.updateUserProfile);
  const sendPasswordResetCode = useAction(api.sendEmail.sendPasswordResetCode);

  useEffect(() => {
    const p = passwordForm.newPassword;
    setPasswordValidation({
      minLength: p.length >= 8,
      hasUppercase: /[A-Z]/.test(p),
      hasLowercase: /[a-z]/.test(p),
      hasNumber: /[0-9]/.test(p),
      hasSymbol: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p),
    });
  }, [passwordForm.newPassword]);

  const isPasswordValid = () => Object.values(passwordValidation).every(v => v === true);

  const getPasswordStrength = () => {
    const count = Object.values(passwordValidation).filter(v => v).length;
    if (count === 0) return { text: '', percentage: 0, color: '' };
    if (count <= 2) return { text: 'Weak', percentage: 20, color: '#dc3545' };
    if (count === 3) return { text: 'Fair', percentage: 40, color: '#ffc107' };
    if (count === 4) return { text: 'Good', percentage: 70, color: '#17a2b8' };
    return { text: 'Strong', percentage: 100, color: '#28a745' };
  };

  const strength = getPasswordStrength();
  const passwordsMatch = passwordForm.confirmPassword && passwordForm.newPassword === passwordForm.confirmPassword;
  const showPasswordRequirements = (passwordFocused || passwordForm.newPassword) && !isPasswordValid();

  // ✅ FIXED: Check localStorage (not sessionStorage) + location.state
  useEffect(() => {
    // ✅ Check both localStorage AND location.state
    const forgotFlag = localStorage.getItem('dkmerch_forgot_password');
    const forgotPassword = location.state?.forgotPassword;
    const activeTabState = location.state?.activeTab;

    if (forgotFlag === 'true' || forgotPassword) {
      setIsForgotPasswordFlow(true);
      setActiveTab('password');
      // ✅ Clean up after reading
      localStorage.removeItem('dkmerch_forgot_password');
      window.history.replaceState({}, document.title);
      return;
    }

    if (activeTabState === 'password') {
      setActiveTab('password');
      window.history.replaceState({}, document.title);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // ✅ FIXED: Auth check AFTER forgot password check so it doesn't redirect too early
  useEffect(() => {
    if (isForgotPasswordFlow) return; // ✅ Skip auth check if forgot password flow
    if (!isAuthenticated) {
      navigate('/');
      return;
    }
    if (user) {
      setAccountForm({
        name: user.name || '',
        username: user.username || '',
        email: user.email || '',
        phone: user.phone || '',
      });
    }
  }, [user, isAuthenticated, navigate, isForgotPasswordFlow]);

  // Cooldown timer
  useEffect(() => {
    if (passwordCooldown <= 0) return;
    const t = setTimeout(() => setPasswordCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [passwordCooldown]);

  const handleAccountChange = (e) => {
    const { name, value } = e.target;
    if (name === 'phone') {
      const digits = value.replace(/\D/g, '');
      if (digits.length > 11) return;
      setAccountForm(prev => ({ ...prev, phone: digits }));
      return;
    }
    if (name === 'email') setEmailChanged(value !== (user?.email || ''));
    setAccountForm(prev => ({ ...prev, [name]: value }));
  };

  const handlePasswordFormChange = (e) => {
    const { name, value } = e.target;
    if (name === 'verificationCode') {
      const digits = value.replace(/\D/g, '');
      if (digits.length > 6) return;
      setPasswordForm(prev => ({ ...prev, verificationCode: digits }));
      return;
    }
    setPasswordForm(prev => ({ ...prev, [name]: value }));
  };

  const handleAccountSubmit = async (e) => {
    e.preventDefault();
    if (!user?._id && !user?.id) { setSaveMsg('❌ User not found.'); return; }
    if (accountForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountForm.email)) {
      setSaveMsg('❌ Please enter a valid email address.'); return;
    }

    setSaving(true);
    setSaveMsg('');
    try {
      const userId = user._id || user.id;
      await updateUserProfile({ id: userId, name: accountForm.name, username: accountForm.username, email: accountForm.email, phone: accountForm.phone });
      if (updateUser) await updateUser({ name: accountForm.name, username: accountForm.username, email: accountForm.email, phone: accountForm.phone });
      setEmailChanged(false);
      setSaveMsg('✅ Account details saved successfully!');
    } catch {
      setSaveMsg('❌ Failed to save. Please try again.');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 4000);
    }
  };

  const handleSendCode = async () => {
    if (passwordCooldown > 0) return;
    if (passwordAttempts >= 3) {
      setCodeMsg('❌ Maximum attempts reached. Try again later.');
      setPasswordCooldown(300);
      setPasswordAttempts(0);
      return;
    }

    const targetEmail = isForgotPasswordFlow ? passwordForm.email : user?.email;
    if (!targetEmail) { setCodeMsg('❌ No email address found.'); return; }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setSentCode(code);
    setSendingCode(true);
    setCodeMsg('');

    try {
      const result = await sendPasswordResetCode({ to: targetEmail, code, name: user?.name || undefined });
      if (result?.success) {
        setCodeMsg(`✅ Code sent to ${targetEmail}! Check your inbox.`);
      } else {
        setCodeMsg(`❌ Failed to send: ${result?.message || 'Unknown error'}`);
        setSentCode('');
      }
    } catch (err) {
      setCodeMsg('❌ Failed to send email. Check your Convex RESEND_API_KEY.');
      setSentCode('');
    } finally {
      setSendingCode(false);
      const newCooldown = passwordAttempts === 0 ? 60 : passwordAttempts === 1 ? 120 : 180;
      setPasswordCooldown(newCooldown);
      setPasswordAttempts(prev => prev + 1);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setSaveMsg('');

    if (!sentCode) { setSaveMsg('❌ Please request a verification code first.'); return; }
    if (passwordForm.verificationCode !== sentCode) { setSaveMsg('❌ Invalid verification code.'); return; }
    if (!isPasswordValid()) { setSaveMsg('❌ Password does not meet all requirements.'); return; }
    if (!passwordsMatch) { setSaveMsg('❌ Passwords do not match.'); return; }

    setSaving(true);
    try {
      const userId = user?._id || user?.id;
      if (userId) {
        await updatePassword({ id: userId, password: passwordForm.newPassword });
        if (updateUser) await updateUser({ password: passwordForm.newPassword });
      }
      setSaveMsg('✅ Password updated successfully!');
      setPasswordForm({ email: '', verificationCode: '', newPassword: '', confirmPassword: '' });
      setSentCode('');
      if (isForgotPasswordFlow) setTimeout(() => navigate('/'), 1500);
    } catch {
      setSaveMsg('❌ Failed to update password. Please try again.');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 4000);
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-container">
        <div className="settings-header">
          <h1>{isForgotPasswordFlow ? 'Reset Password' : 'Account Settings'}</h1>
          <p>{isForgotPasswordFlow ? 'Enter your email and verification code to reset your password' : 'Manage your account details and security'}</p>
        </div>

        {!isForgotPasswordFlow && (
          <div className="settings-tabs">
            <button className={`settings-tab ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>
              <i className="fas fa-user"></i> Account Details
            </button>
            <button className={`settings-tab ${activeTab === 'password' ? 'active' : ''}`} onClick={() => setActiveTab('password')}>
              <i className="fas fa-lock"></i> Change Password
            </button>
          </div>
        )}

        <div className="settings-content">

          {activeTab === 'details' && !isForgotPasswordFlow && (
            <form onSubmit={handleAccountSubmit} className="settings-form">
              <h2>Personal Information</h2>

              <div className="form-group">
                <label>Full Name</label>
                <input type="text" name="name" className="form-control" value={accountForm.name} onChange={handleAccountChange} required />
              </div>
              <div className="form-group">
                <label>Username</label>
                <input type="text" name="username" className="form-control" value={accountForm.username} onChange={handleAccountChange} required />
              </div>
              <div className="form-group">
                <label>Email Address</label>
                <input type="email" name="email" className="form-control" value={accountForm.email} onChange={handleAccountChange} required />
                {emailChanged && (
                  <small className="email-change-note">
                    <i className="fas fa-info-circle"></i> Changing your email will update your login credentials.
                  </small>
                )}
              </div>
              <div className="form-group">
                <label>Phone Number</label>
                <input type="tel" name="phone" className="form-control" placeholder="09XXXXXXXXX" value={accountForm.phone} onChange={handleAccountChange} maxLength="11" />
                <small>Auto-filled from checkout info. Changes here will reflect on your next order.</small>
              </div>

              {saveMsg && <div className={`save-message ${saveMsg.startsWith('✅') ? 'success' : 'error'}`}>{saveMsg}</div>}

              <button type="submit" className="btn btn-primary btn-save" disabled={saving}>
                <i className="fas fa-save"></i> {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          )}

          {(activeTab === 'password' || isForgotPasswordFlow) && (
            <form onSubmit={handlePasswordSubmit} className="settings-form">
              <h2>{isForgotPasswordFlow ? 'Reset Your Password' : 'Change Password'}</h2>
              <p className="form-description">
                {isForgotPasswordFlow ? "Enter your email and we'll send you a verification code" : `We'll send a verification code to ${user?.email}`}
              </p>

              {isForgotPasswordFlow && (
                <div className="form-group">
                  <label>Email Address</label>
                  <input type="email" name="email" className="form-control" placeholder="Enter your registered email" value={passwordForm.email} onChange={handlePasswordFormChange} required />
                </div>
              )}

              <div className="form-group">
                <label>Verification Code</label>
                <div className="input-with-badge">
                  <input
                    type="text" name="verificationCode" className="form-control"
                    placeholder="Enter 6-digit code"
                    value={passwordForm.verificationCode}
                    onChange={handlePasswordFormChange}
                    maxLength="6" required
                  />
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
                  <button type="button" className="pw-toggle-btn" onClick={() => setShowNewPassword(p => !p)} aria-label="Toggle password">
                    <i className={`fas ${showNewPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>

                {passwordForm.newPassword && (
                  <div className="pw-strength-wrap">
                    <div className="pw-strength-bar">
                      <div className="pw-strength-fill" style={{ width: `${strength.percentage}%`, backgroundColor: strength.color }} />
                    </div>
                    {strength.text && <span className="pw-strength-label" style={{ color: strength.color }}>{strength.text}</span>}
                  </div>
                )}

                {showPasswordRequirements && (
                  <div className="pw-requirements">
                    <div className="pw-req-title">Password must contain:</div>
                    <div className="pw-req-list">
                      {[
                        { key: 'minLength', label: 'At least 8 characters' },
                        { key: 'hasUppercase', label: 'One uppercase letter' },
                        { key: 'hasLowercase', label: 'One lowercase letter' },
                        { key: 'hasNumber', label: 'One number' },
                        { key: 'hasSymbol', label: 'One special character' },
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
                  <div className="pw-success-msg">
                    <i className="fas fa-check-circle"></i>
                    <span>Great! Your password is strong</span>
                  </div>
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
                  <button type="button" className="pw-toggle-btn" onClick={() => setShowConfirmPassword(p => !p)} aria-label="Toggle confirm password">
                    <i className={`fas ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
                {passwordsMatch && (
                  <div className="pw-match-msg">
                    <i className="fas fa-check-circle"></i>
                    <span>Passwords match!</span>
                  </div>
                )}
              </div>

              {saveMsg && <div className={`save-message ${saveMsg.startsWith('✅') ? 'success' : 'error'}`}>{saveMsg}</div>}

              <button type="submit" className="btn btn-primary btn-save" disabled={saving || !isPasswordValid() || !passwordsMatch}>
                <i className="fas fa-key"></i>
                {saving ? 'Saving...' : isForgotPasswordFlow ? 'Reset Password' : 'Update Password'}
              </button>

              {isForgotPasswordFlow && (
                <button type="button" className="btn btn-save" onClick={() => navigate('/')} style={{ marginTop: '10px', background: '#6c757d', color: 'white' }}>
                  <i className="fas fa-arrow-left"></i> Back to Login
                </button>
              )}
            </form>
          )}

        </div>
      </div>
    </div>
  );
};

export default Settings;