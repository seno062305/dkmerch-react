import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import './Settings.css';

const Settings = () => {
  const { user, isAuthenticated, updateUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('details');
  const [isForgotPasswordFlow, setIsForgotPasswordFlow] = useState(false);

  // Account Details Form
  const [accountForm, setAccountForm] = useState({
    name: '',
    username: '',
    email: '',
    phone: ''
  });

  // Change Password Form
  const [passwordForm, setPasswordForm] = useState({
    email: '', // For forgot password flow
    newPassword: '',
    confirmPassword: '',
    verificationCode: ''
  });

  // Verification states
  const [emailVerified, setEmailVerified] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [passwordResetCode, setPasswordResetCode] = useState('');
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationType, setVerificationType] = useState(''); // 'email' or 'phone'
  
  // Cooldown states
  const [passwordCooldown, setPasswordCooldown] = useState(0);
  const [passwordAttempts, setPasswordAttempts] = useState(0);
  const [emailCooldown, setEmailCooldown] = useState(0);
  const [emailAttempts, setEmailAttempts] = useState(0);
  const [phoneCooldown, setPhoneCooldown] = useState(0);
  const [phoneAttempts, setPhoneAttempts] = useState(0);

  // ✅ CHECK FOR NAVIGATION STATE AND FORGOT PASSWORD FLOW
  useEffect(() => {
    // Check if coming from forgot password
    const forgotPasswordFlag = localStorage.getItem('dkmerch_forgot_password');
    
    if (forgotPasswordFlag === 'true' || location.state?.forgotPassword) {
      setIsForgotPasswordFlow(true);
      setActiveTab('password');
      localStorage.removeItem('dkmerch_forgot_password');
      return;
    }

    // If navigated from "Forgot Password" while logged in
    if (location.state?.activeTab === 'password') {
      setActiveTab('password');
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  useEffect(() => {
    // ✅ ALLOW ACCESS IF FORGOT PASSWORD FLOW (KAHIT HINDI NAKA-LOGIN)
    if (isForgotPasswordFlow) {
      // Don't redirect, allow password reset
      return;
    }

    // Redirect if not logged in and NOT in forgot password flow
    if (!isAuthenticated) {
      navigate('/');
      return;
    }

    // Load user data
    if (user) {
      setAccountForm({
        name: user.name || '',
        username: user.username || user.email?.split('@')[0] || '',
        email: user.email || '',
        phone: user.phone || ''
      });
      setEmailVerified(user.emailVerified || false);
      setPhoneVerified(user.phoneVerified || false);
    }

    // Load cooldown states from localStorage
    const savedCooldowns = JSON.parse(localStorage.getItem('dkmerch_cooldowns')) || {};
    if (savedCooldowns.password) {
      const elapsed = Math.floor((Date.now() - savedCooldowns.password.timestamp) / 1000);
      const remaining = savedCooldowns.password.duration - elapsed;
      if (remaining > 0) {
        setPasswordCooldown(remaining);
        setPasswordAttempts(savedCooldowns.password.attempts || 0);
      }
    }
    if (savedCooldowns.email) {
      const elapsed = Math.floor((Date.now() - savedCooldowns.email.timestamp) / 1000);
      const remaining = savedCooldowns.email.duration - elapsed;
      if (remaining > 0) {
        setEmailCooldown(remaining);
        setEmailAttempts(savedCooldowns.email.attempts || 0);
      }
    }
    if (savedCooldowns.phone) {
      const elapsed = Math.floor((Date.now() - savedCooldowns.phone.timestamp) / 1000);
      const remaining = savedCooldowns.phone.duration - elapsed;
      if (remaining > 0) {
        setPhoneCooldown(remaining);
        setPhoneAttempts(savedCooldowns.phone.attempts || 0);
      }
    }
  }, [user, isAuthenticated, navigate, isForgotPasswordFlow]);

  // Cooldown timers with localStorage persistence
  useEffect(() => {
    if (passwordCooldown > 0) {
      const timer = setTimeout(() => setPasswordCooldown(passwordCooldown - 1), 1000);
      
      // Save to localStorage
      const cooldowns = JSON.parse(localStorage.getItem('dkmerch_cooldowns')) || {};
      cooldowns.password = {
        duration: passwordCooldown,
        timestamp: Date.now(),
        attempts: passwordAttempts
      };
      localStorage.setItem('dkmerch_cooldowns', JSON.stringify(cooldowns));
      
      return () => clearTimeout(timer);
    } else if (passwordCooldown === 0) {
      // Clear from localStorage when done
      const cooldowns = JSON.parse(localStorage.getItem('dkmerch_cooldowns')) || {};
      delete cooldowns.password;
      localStorage.setItem('dkmerch_cooldowns', JSON.stringify(cooldowns));
    }
  }, [passwordCooldown, passwordAttempts]);

  useEffect(() => {
    if (emailCooldown > 0) {
      const timer = setTimeout(() => setEmailCooldown(emailCooldown - 1), 1000);
      
      const cooldowns = JSON.parse(localStorage.getItem('dkmerch_cooldowns')) || {};
      cooldowns.email = {
        duration: emailCooldown,
        timestamp: Date.now(),
        attempts: emailAttempts
      };
      localStorage.setItem('dkmerch_cooldowns', JSON.stringify(cooldowns));
      
      return () => clearTimeout(timer);
    } else if (emailCooldown === 0) {
      const cooldowns = JSON.parse(localStorage.getItem('dkmerch_cooldowns')) || {};
      delete cooldowns.email;
      localStorage.setItem('dkmerch_cooldowns', JSON.stringify(cooldowns));
    }
  }, [emailCooldown, emailAttempts]);

  useEffect(() => {
    if (phoneCooldown > 0) {
      const timer = setTimeout(() => setPhoneCooldown(phoneCooldown - 1), 1000);
      
      const cooldowns = JSON.parse(localStorage.getItem('dkmerch_cooldowns')) || {};
      cooldowns.phone = {
        duration: phoneCooldown,
        timestamp: Date.now(),
        attempts: phoneAttempts
      };
      localStorage.setItem('dkmerch_cooldowns', JSON.stringify(cooldowns));
      
      return () => clearTimeout(timer);
    } else if (phoneCooldown === 0) {
      const cooldowns = JSON.parse(localStorage.getItem('dkmerch_cooldowns')) || {};
      delete cooldowns.phone;
      localStorage.setItem('dkmerch_cooldowns', JSON.stringify(cooldowns));
    }
  }, [phoneCooldown, phoneAttempts]);

  const handleAccountChange = (e) => {
    const { name, value } = e.target;
    
    // Phone number validation - max 11 digits, numbers only
    if (name === 'phone') {
      const phoneDigits = value.replace(/\D/g, ''); // Remove non-digits
      if (phoneDigits.length > 11) return; // Prevent more than 11 digits
      setAccountForm(prev => ({ ...prev, [name]: phoneDigits }));
      return;
    }
    
    setAccountForm(prev => ({ ...prev, [name]: value }));
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    
    // Verification code - numbers only, max 6 digits
    if (name === 'verificationCode') {
      const codeDigits = value.replace(/\D/g, '');
      if (codeDigits.length > 6) return;
      setPasswordForm(prev => ({ ...prev, [name]: codeDigits }));
      
      // Auto-verify when 6 digits entered
      if (codeDigits.length === 6) {
        if (codeDigits === passwordResetCode) {
          console.log('✅ Code verified!');
        }
      }
      return;
    }
    
    setPasswordForm(prev => ({ ...prev, [name]: value }));
  };

  const handleAccountSubmit = (e) => {
    e.preventDefault();

    // Get stored users
    const users = JSON.parse(localStorage.getItem('dkmerch_users')) || [];
    const userIndex = users.findIndex(u => u.email === user.email);

    if (userIndex !== -1) {
      // Update user data
      users[userIndex] = {
        ...users[userIndex],
        name: accountForm.name,
        username: accountForm.username,
        phone: accountForm.phone,
        emailVerified: emailVerified,
        phoneVerified: phoneVerified
      };

      localStorage.setItem('dkmerch_users', JSON.stringify(users));

      // Update current user in AuthContext
      if (updateUser) {
        updateUser(users[userIndex]);
      }

      alert('✅ Account details updated successfully!');
    }
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();

    // ✅ VALIDATION: Check password length
    if (passwordForm.newPassword.length < 6) {
      alert('❌ Password must be at least 6 characters long!');
      return;
    }

    // ✅ VALIDATION: Check password match
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      alert('❌ Passwords do not match!');
      return;
    }

    // ✅ VALIDATION: Check verification code
    if (passwordForm.verificationCode !== passwordResetCode) {
      alert('❌ Invalid verification code!');
      return;
    }

    // Determine which email to use
    let targetEmail = '';
    if (isForgotPasswordFlow) {
      // Use email from form (for forgot password flow)
      targetEmail = passwordForm.email;
    } else {
      // Use current user's email (for logged-in user)
      targetEmail = user?.email;
    }

    if (!targetEmail) {
      alert('❌ Email is required!');
      return;
    }

    // Get stored users
    const users = JSON.parse(localStorage.getItem('dkmerch_users')) || [];
    const userIndex = users.findIndex(u => u.email === targetEmail);

    if (userIndex !== -1) {
      // ✅ UPDATE PASSWORD
      users[userIndex].password = passwordForm.newPassword;
      localStorage.setItem('dkmerch_users', JSON.stringify(users));

      // Clear form
      setPasswordForm({
        email: '',
        newPassword: '',
        confirmPassword: '',
        verificationCode: ''
      });
      setPasswordResetCode('');

      // ✅ SUCCESS MESSAGE
      alert('✅ Password updated successfully!\n\nYou can now login with your new password.');

      // Redirect to home page after password reset
      if (isForgotPasswordFlow) {
        setTimeout(() => {
          navigate('/');
        }, 1000);
      }
    } else {
      alert('❌ User not found!');
    }
  };

  const handleSendPasswordResetCode = () => {
    // Check cooldown
    if (passwordCooldown > 0) {
      alert(`⏳ Please wait ${passwordCooldown} seconds before requesting another code.`);
      return;
    }

    // Check attempts
    if (passwordAttempts >= 3) {
      alert('❌ Maximum attempts reached. Please try again later.');
      const newCooldown = 300; // 5 minutes
      setPasswordCooldown(newCooldown);
      setPasswordAttempts(0);
      return;
    }

    // For forgot password flow, check if email is provided and valid
    if (isForgotPasswordFlow) {
      if (!passwordForm.email) {
        alert('❌ Please enter your email address!');
        return;
      }

      // Check if email exists
      const users = JSON.parse(localStorage.getItem('dkmerch_users')) || [];
      const userExists = users.find(u => u.email === passwordForm.email);

      if (!userExists) {
        alert('❌ Email not found! Please check your email or sign up.');
        return;
      }
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setPasswordResetCode(code);

    // Get email to display
    const displayEmail = isForgotPasswordFlow ? passwordForm.email : user?.email;

    // Show code (in real app, this would be sent via email)
    alert(`✅ Verification code sent!\n\nYour code: ${code}\n\n(In production, this would be sent to ${displayEmail})`);

    // Set cooldown
    const newCooldown = passwordAttempts === 0 ? 60 : passwordAttempts === 1 ? 120 : 180;
    setPasswordCooldown(newCooldown);
    setPasswordAttempts(prev => prev + 1);
  };

  const handleSendVerification = (type) => {
    if (type === 'email' && emailCooldown > 0) {
      alert(`⏳ Please wait ${emailCooldown} seconds before requesting another code.`);
      return;
    }
    if (type === 'phone' && phoneCooldown > 0) {
      alert(`⏳ Please wait ${phoneCooldown} seconds before requesting another code.`);
      return;
    }

    // Check attempts
    if (type === 'email' && emailAttempts >= 3) {
      alert('❌ Maximum attempts reached. Please try again later.');
      setEmailCooldown(300);
      setEmailAttempts(0);
      return;
    }
    if (type === 'phone' && phoneAttempts >= 3) {
      alert('❌ Maximum attempts reached. Please try again later.');
      setPhoneCooldown(300);
      setPhoneAttempts(0);
      return;
    }

    // Generate verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setVerificationCode(code);
    setVerificationType(type);
    
    // Show code (in real app, this would be sent)
    alert(`✅ Verification code sent!\n\nYour code: ${code}\n\n(In production, this would be sent to your ${type})`);
    
    setShowVerificationModal(true);

    // Set cooldown based on attempts
    if (type === 'email') {
      const newCooldown = emailAttempts === 0 ? 60 : emailAttempts === 1 ? 120 : 180;
      setEmailCooldown(newCooldown);
      setEmailAttempts(prev => prev + 1);
    } else {
      const newCooldown = phoneAttempts === 0 ? 60 : phoneAttempts === 1 ? 120 : 180;
      setPhoneCooldown(newCooldown);
      setPhoneAttempts(prev => prev + 1);
    }
  };

  const handleVerifyCode = () => {
    const inputCode = prompt(`Enter the 6-digit verification code sent to your ${verificationType}:`);
    
    if (inputCode === verificationCode) {
      if (verificationType === 'email') {
        setEmailVerified(true);
        alert('✅ Email verified successfully!');
      } else if (verificationType === 'phone') {
        setPhoneVerified(true);
        alert('✅ Phone number verified successfully!');
      }
      
      // Update in localStorage
      const users = JSON.parse(localStorage.getItem('dkmerch_users')) || [];
      const userIndex = users.findIndex(u => u.email === user.email);
      
      if (userIndex !== -1) {
        if (verificationType === 'email') {
          users[userIndex].emailVerified = true;
        } else {
          users[userIndex].phoneVerified = true;
        }
        localStorage.setItem('dkmerch_users', JSON.stringify(users));
      }
      
      setShowVerificationModal(false);
    } else {
      alert('❌ Invalid verification code!');
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-container">
        <div className="settings-header">
          <h1>{isForgotPasswordFlow ? 'Reset Password' : 'Account Settings'}</h1>
          <p>{isForgotPasswordFlow ? 'Enter your email and verification code to reset your password' : 'Manage your account details and security'}</p>
        </div>

        {/* Tab Navigation - Hide if forgot password flow */}
        {!isForgotPasswordFlow && (
          <div className="settings-tabs">
            <button
              className={`settings-tab ${activeTab === 'details' ? 'active' : ''}`}
              onClick={() => setActiveTab('details')}
              data-tab="details"
            >
              <i className="fas fa-user"></i>
              Account Details
            </button>
            <button
              className={`settings-tab ${activeTab === 'password' ? 'active' : ''}`}
              onClick={() => setActiveTab('password')}
              data-tab="password"
            >
              <i className="fas fa-lock"></i>
              Change Password
            </button>
          </div>
        )}

        {/* Tab Content */}
        <div className="settings-content">
          {/* ACCOUNT DETAILS TAB - Only show if logged in */}
          {activeTab === 'details' && !isForgotPasswordFlow && (
            <form onSubmit={handleAccountSubmit} className="settings-form">
              <h2>Personal Information</h2>
              
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  name="name"
                  className="form-control"
                  value={accountForm.name}
                  onChange={handleAccountChange}
                  required
                />
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
                />
              </div>

              <div className="form-group">
                <label>Email Address</label>
                <div className="input-with-badge">
                  <input
                    type="email"
                    name="email"
                    className="form-control"
                    value={accountForm.email}
                    onChange={handleAccountChange}
                    required
                    disabled
                  />
                  <span className="verified-badge">
                    <i className="fas fa-check-circle"></i> Verified
                  </span>
                </div>
                <small>Email cannot be changed for security reasons</small>
              </div>

              <div className="form-group">
                <label>Phone Number</label>
                <div className="input-with-badge">
                  <input
                    type="tel"
                    name="phone"
                    className="form-control"
                    placeholder="09XXXXXXXXX (11 digits)"
                    value={accountForm.phone}
                    onChange={handleAccountChange}
                    maxLength="11"
                    pattern="\d*"
                    inputMode="numeric"
                  />
                  {phoneVerified ? (
                    <span className="verified-badge">
                      <i className="fas fa-check-circle"></i> Verified
                    </span>
                  ) : accountForm.phone && accountForm.phone.length === 11 && (
                    <button
                      type="button"
                      className="verify-btn"
                      onClick={() => handleSendVerification('phone')}
                      disabled={phoneCooldown > 0}
                    >
                      {phoneCooldown > 0 ? `Wait ${phoneCooldown}s` : 'Verify Phone'}
                    </button>
                  )}
                </div>
                <small>Enter 11-digit phone number (e.g., 09171234567)</small>
              </div>

              <button type="submit" className="btn btn-primary btn-save">
                <i className="fas fa-save"></i>
                Save Changes
              </button>
            </form>
          )}

          {/* CHANGE PASSWORD TAB */}
          {(activeTab === 'password' || isForgotPasswordFlow) && (
            <form onSubmit={handlePasswordSubmit} className="settings-form">
              <h2>{isForgotPasswordFlow ? 'Reset Your Password' : 'Change Password'}</h2>
              <p className="form-description">
                {isForgotPasswordFlow 
                  ? 'Enter your email and verification code to reset your password'
                  : 'Enter a verification code sent to your email to reset your password'}
              </p>

              {/* Email field - only for forgot password flow */}
              {isForgotPasswordFlow && (
                <div className="form-group">
                  <label>Email Address</label>
                  <input
                    type="email"
                    name="email"
                    className="form-control"
                    placeholder="Enter your email"
                    value={passwordForm.email}
                    onChange={handlePasswordChange}
                    required
                  />
                  <small>Enter the email associated with your account</small>
                </div>
              )}

              <div className="form-group">
                <label>Verification Code</label>
                <div className="input-with-badge">
                  <input
                    type="text"
                    name="verificationCode"
                    className="form-control"
                    placeholder="Enter 6-digit code"
                    value={passwordForm.verificationCode}
                    onChange={handlePasswordChange}
                    maxLength="6"
                    pattern="\d*"
                    inputMode="numeric"
                    required
                  />
                  <button
                    type="button"
                    className="verify-btn"
                    onClick={handleSendPasswordResetCode}
                    disabled={passwordCooldown > 0}
                  >
                    {passwordCooldown > 0 ? `Wait ${passwordCooldown}s` : 'Send Code'}
                  </button>
                </div>
                <small>
                  {isForgotPasswordFlow 
                    ? 'A verification code will be sent to your email'
                    : `A verification code will be sent to ${user?.email}`}
                </small>
              </div>

              <div className="form-group">
                <label>New Password</label>
                <input
                  type="password"
                  name="newPassword"
                  className="form-control"
                  placeholder="Enter new password"
                  value={passwordForm.newPassword}
                  onChange={handlePasswordChange}
                  required
                />
                <small>Password must be at least 6 characters long</small>
              </div>

              <div className="form-group">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  name="confirmPassword"
                  className="form-control"
                  placeholder="Re-enter new password"
                  value={passwordForm.confirmPassword}
                  onChange={handlePasswordChange}
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary btn-save">
                <i className="fas fa-key"></i>
                {isForgotPasswordFlow ? 'Reset Password' : 'Update Password'}
              </button>

              {/* Back to login button for forgot password flow */}
              {isForgotPasswordFlow && (
                <button 
                  type="button" 
                  className="btn btn-secondary btn-save"
                  onClick={() => navigate('/')}
                  style={{ marginTop: '10px', background: '#6c757d' }}
                >
                  <i className="fas fa-arrow-left"></i>
                  Back to Login
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