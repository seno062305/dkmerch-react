// src/components/LoginModal.js
import React, { useState, useEffect } from "react";
import "./LoginModal.css";
import { useAuth } from "../context/AuthContext";
import RegisterModal from "./RegisterModal";
import { useNavigate } from "react-router-dom";
import { useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";

// ── Rate limit helpers (per-browser via sessionStorage) ──────────────────────
const RL_KEY_ATTEMPTS = "dkmerch_login_attempts";
const RL_KEY_LOCKOUT  = "dkmerch_login_lockout_until";
const BASE_LOCKOUT    = 60;   // seconds after 5th fail
const EXTRA_PER_FAIL  = 30;   // added seconds for each fail after 5th

function getRLState() {
  const attempts   = parseInt(sessionStorage.getItem(RL_KEY_ATTEMPTS) || "0", 10);
  const lockoutEnd = parseInt(sessionStorage.getItem(RL_KEY_LOCKOUT)  || "0", 10);
  return { attempts, lockoutEnd };
}

function recordFailedAttempt() {
  let { attempts } = getRLState();
  attempts += 1;
  sessionStorage.setItem(RL_KEY_ATTEMPTS, attempts);

  let lockoutSecs = 0;
  if (attempts >= 5) {
    // 5th fail → 60s, 6th → 90s, 7th → 120s, ...
    lockoutSecs = BASE_LOCKOUT + Math.max(0, attempts - 5) * EXTRA_PER_FAIL;
  }

  if (lockoutSecs > 0) {
    const until = Date.now() + lockoutSecs * 1000;
    sessionStorage.setItem(RL_KEY_LOCKOUT, until);
  }

  return { attempts, lockoutSecs };
}

function resetRLState() {
  sessionStorage.removeItem(RL_KEY_ATTEMPTS);
  sessionStorage.removeItem(RL_KEY_LOCKOUT);
}

function getRemainingLockout() {
  const { lockoutEnd } = getRLState();
  if (!lockoutEnd) return 0;
  return Math.max(0, Math.ceil((lockoutEnd - Date.now()) / 1000));
}
// ─────────────────────────────────────────────────────────────────────────────

const LoginModal = ({ onClose, onLoginSuccess }) => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [view, setView] = useState("login");

  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showRegister, setShowRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // ── Rate limit state ──
  const [loginCooldown, setLoginCooldown]     = useState(0);
  const [loginAttempts, setLoginAttempts]     = useState(0);

  const [forgotEmail, setForgotEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [sentCode, setSentCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [codeMsg, setCodeMsg] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [passwordCooldown, setPasswordCooldown] = useState(0);
  const [passwordAttempts, setPasswordAttempts] = useState(0);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmNewPw, setShowConfirmNewPw] = useState(false);
  const [newPwFocused, setNewPwFocused] = useState(false);
  const [newPwValidation, setNewPwValidation] = useState({
    minLength: false, hasUppercase: false, hasLowercase: false,
    hasNumber: false, hasSymbol: false
  });

  const resetPasswordByEmail = useMutation(api.users.resetPasswordByEmail);
  const sendPasswordResetCode = useAction(api.sendEmail.sendPasswordResetCode);

  // ── On mount: restore any existing lockout from sessionStorage ──
  useEffect(() => {
    const remaining = getRemainingLockout();
    const { attempts } = getRLState();
    if (remaining > 0) {
      setLoginCooldown(remaining);
      setLoginAttempts(attempts);
    }
  }, []);

  // ── Tick down login cooldown ──
  useEffect(() => {
    if (loginCooldown <= 0) return;
    const t = setTimeout(() => setLoginCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [loginCooldown]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.body.classList.add('login-modal-open');
    return () => {
      document.body.style.overflow = "";
      document.body.classList.remove('login-modal-open');
    };
  }, []);

  useEffect(() => {
    const p = newPassword;
    setNewPwValidation({
      minLength: p.length >= 8,
      hasUppercase: /[A-Z]/.test(p),
      hasLowercase: /[a-z]/.test(p),
      hasNumber: /[0-9]/.test(p),
      hasSymbol: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p)
    });
  }, [newPassword]);

  useEffect(() => {
    if (passwordCooldown <= 0) return;
    const t = setTimeout(() => setPasswordCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [passwordCooldown]);

  useEffect(() => {
    if (view === "forgot") {
      setForgotEmail("");
      setVerificationCode("");
      setNewPassword("");
      setConfirmNewPassword("");
      setSentCode("");
      setCodeMsg("");
      setResetMsg("");
      setPasswordCooldown(0);
      setPasswordAttempts(0);
    }
  }, [view]);

  const isNewPwValid = () => Object.values(newPwValidation).every(v => v === true);

  const getStrength = (validation) => {
    const count = Object.values(validation).filter(v => v).length;
    if (count === 0) return { text: "", percentage: 0, color: "" };
    if (count <= 2) return { text: "Weak", percentage: 20, color: "#dc3545" };
    if (count === 3) return { text: "Fair", percentage: 40, color: "#ffc107" };
    if (count === 4) return { text: "Good", percentage: 70, color: "#17a2b8" };
    return { text: "Strong", percentage: 100, color: "#28a745" };
  };

  const newPwStrength = getStrength(newPwValidation);
  const showNewPwReqs = (newPwFocused || newPassword) && !isNewPwValid();
  const newPasswordsMatch = confirmNewPassword && newPassword === confirmNewPassword;

  const accentColor    = "#ec4899";
  const accentGradient = "linear-gradient(135deg, #ec4899, #f472b6)";
  const accentShadow   = "rgba(236,72,153,0.3)";

  // ── Format cooldown nicely: "1:30" or "45s" ──
  const formatCooldown = (secs) => {
    if (secs >= 60) {
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      return s > 0 ? `${m}m ${s}s` : `${m}m`;
    }
    return `${secs}s`;
  };

  const PwToggleIcon = ({ show }) => show ? (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
      <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
    </svg>
  ) : (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
      <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
    </svg>
  );

  const PwRequirements = ({ validation }) => (
    <div className="password-requirements">
      <div className="requirements-title">Password must contain:</div>
      <div className="requirements-list">
        {[
          { key: "minLength", label: "At least 8 characters" },
          { key: "hasUppercase", label: "One uppercase letter" },
          { key: "hasLowercase", label: "One lowercase letter" },
          { key: "hasNumber", label: "One number" },
          { key: "hasSymbol", label: "One special character" },
        ].map(({ key, label }) => (
          <div key={key} className={`requirement-item ${validation[key] ? "valid" : ""}`}>
            <svg viewBox="0 0 20 20" fill="currentColor">
              {validation[key] ? (
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              ) : (
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              )}
            </svg>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // ── Block if still locked out ──
    const remaining = getRemainingLockout();
    if (remaining > 0) {
      setLoginCooldown(remaining);
      setError(`Too many failed attempts. Please wait ${formatCooldown(remaining)}.`);
      return;
    }

    setIsLoading(true);
    try {
      const result = await login(formData.email, formData.password, "user");
      if (!result.success) {
        // Record failed attempt
        const { attempts, lockoutSecs } = recordFailedAttempt();
        setLoginAttempts(attempts);

        if (lockoutSecs > 0) {
          setLoginCooldown(lockoutSecs);
          setError(
            attempts === 5
              ? `Too many failed attempts. Please wait ${formatCooldown(lockoutSecs)} before trying again.`
              : `Account temporarily locked. Please wait ${formatCooldown(lockoutSecs)}.`
          );
        } else {
          const remaining = 5 - attempts;
          setError(
            remaining > 0
              ? `${result.message} (${remaining} attempt${remaining !== 1 ? "s" : ""} left before lockout)`
              : result.message
          );
        }
        return;
      }

      // ── Success: clear rate limit ──
      resetRLState();
      setLoginAttempts(0);
      setLoginCooldown(0);

      if (onLoginSuccess) {
        onLoginSuccess(result.role);
      } else {
        onClose();
      }
    } catch (err) {
      setError("Login failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error && loginCooldown <= 0) setError("");
  };

  const handleSwitchToRegister = () => {
    setFormData({ email: "", password: "" });
    setError("");
    setShowRegister(true);
  };

  const handleRegisterSuccess = () => setShowRegister(false);

  const handleSendCode = async () => {
    if (passwordCooldown > 0) return;
    if (!forgotEmail.trim() || !/\S+@\S+\.\S+/.test(forgotEmail)) {
      setCodeMsg("❌ Please enter a valid email address.");
      return;
    }
    if (passwordAttempts >= 3) {
      setCodeMsg("❌ Maximum attempts reached. Try again later.");
      setPasswordCooldown(300);
      setPasswordAttempts(0);
      return;
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setSentCode(code);
    setSendingCode(true);
    setCodeMsg("");
    try {
      const result = await sendPasswordResetCode({
        to: forgotEmail,
        code,
        accountType: "customer",
      });
      if (result?.success) {
        setCodeMsg(`✅ Code sent to ${forgotEmail}! Check your inbox.`);
      } else {
        setCodeMsg(`❌ Failed to send: ${result?.message || "Unknown error"}`);
        setSentCode("");
      }
    } catch {
      setCodeMsg("❌ Failed to send email.");
      setSentCode("");
    } finally {
      setSendingCode(false);
      const cooldown = passwordAttempts === 0 ? 60 : passwordAttempts === 1 ? 120 : 180;
      setPasswordCooldown(cooldown);
      setPasswordAttempts(prev => prev + 1);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetMsg("");
    if (!sentCode) { setResetMsg("❌ Please request a verification code first."); return; }
    if (verificationCode !== sentCode) { setResetMsg("❌ Invalid verification code."); return; }
    if (!isNewPwValid()) {
      setResetMsg("❌ Password does not meet all requirements.");
      return;
    }
    if (!newPasswordsMatch) { setResetMsg("❌ Passwords do not match."); return; }

    setResetLoading(true);
    try {
      const result = await resetPasswordByEmail({
        email: forgotEmail,
        newPassword: newPassword,
        accountType: "customer",
      });
      if (result?.success) {
        setResetMsg("✅ Password reset successful! You can now log in.");
        setTimeout(() => {
          setForgotEmail(""); setVerificationCode(""); setNewPassword("");
          setConfirmNewPassword(""); setSentCode(""); setCodeMsg("");
          setResetMsg(""); setView("login");
        }, 1500);
      } else {
        setResetMsg(`❌ ${result?.message || "No account found with that email."}`);
      }
    } catch {
      setResetMsg("❌ Failed to reset password. Please try again.");
    } finally {
      setResetLoading(false);
    }
  };

  if (showRegister) return <RegisterModal onClose={handleRegisterSuccess} />;

  // Is the login button currently locked?
  const isLockedOut = loginCooldown > 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="login-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {view === "forgot" ? (
          <>
            <div className="login-modal-header">
              <div className="login-icon" style={{ background: accentGradient, boxShadow: `0 10px 25px ${accentShadow}` }}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                </svg>
              </div>
              <h2 style={{ background: accentGradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                Reset Password
              </h2>
              <p className="login-subtitle">Enter your email to get a verification code</p>
            </div>

            <form onSubmit={handleResetPassword} className="login-form">
              <div className="input-group">
                <label>Email Address</label>
                <div className="input-wrapper">
                  <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                  </svg>
                  <input
                    type="email"
                    placeholder="Enter your registered email"
                    className="form-input"
                    value={forgotEmail}
                    onChange={(e) => { setForgotEmail(e.target.value); setCodeMsg(""); }}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label>Verification Code</label>
                <div className="forgot-code-row">
                  <div className="input-wrapper" style={{ flex: 1 }}>
                    <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Enter 6-digit code"
                      className="form-input"
                      value={verificationCode}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "");
                        if (digits.length <= 6) setVerificationCode(digits);
                      }}
                      maxLength="6"
                      required
                    />
                  </div>
                  <button
                    type="button"
                    className="send-code-btn"
                    style={{
                      background: (passwordCooldown > 0 || sendingCode) ? "#d1d5db" : accentGradient,
                      cursor: (passwordCooldown > 0 || sendingCode) ? "not-allowed" : "pointer",
                    }}
                    onClick={handleSendCode}
                    disabled={passwordCooldown > 0 || sendingCode}
                  >
                    {sendingCode ? "Sending..." : passwordCooldown > 0 ? `Wait ${passwordCooldown}s` : "Send Code"}
                  </button>
                </div>
                {codeMsg && (
                  <div className={`forgot-msg ${codeMsg.startsWith("✅") ? "success" : "error"}`}>
                    {codeMsg}
                  </div>
                )}
              </div>

              <div className="input-group">
                <label>New Password</label>
                <div className="input-wrapper">
                  <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  <input
                    type={showNewPw ? "text" : "password"}
                    placeholder="Create a strong password"
                    className={`form-input password-input ${isNewPwValid() && newPassword ? "valid" : ""}`}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    onFocus={() => setNewPwFocused(true)}
                    onBlur={() => setNewPwFocused(false)}
                    required
                  />
                  <button type="button" className="password-toggle" onClick={() => setShowNewPw(p => !p)}>
                    <PwToggleIcon show={showNewPw} />
                  </button>
                </div>

                {newPassword && (
                  <div className="password-strength-container">
                    <div className="password-strength-bar">
                      <div className="password-strength-fill" style={{ width: `${newPwStrength.percentage}%`, backgroundColor: newPwStrength.color }} />
                    </div>
                    {newPwStrength.text && <div className="password-strength-label" style={{ color: newPwStrength.color }}>{newPwStrength.text}</div>}
                  </div>
                )}
                {showNewPwReqs && <PwRequirements validation={newPwValidation} />}

                {isNewPwValid() && newPassword && (
                  <div className="password-success-message">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Great! Your password is strong</span>
                  </div>
                )}
              </div>

              <div className="input-group">
                <label>Confirm New Password</label>
                <div className="input-wrapper">
                  <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <input
                    type={showConfirmNewPw ? "text" : "password"}
                    placeholder="Confirm your new password"
                    className={`form-input password-input ${newPasswordsMatch ? "valid" : ""}`}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    required
                  />
                  <button type="button" className="password-toggle" onClick={() => setShowConfirmNewPw(p => !p)}>
                    <PwToggleIcon show={showConfirmNewPw} />
                  </button>
                </div>
                {newPasswordsMatch && (
                  <div className="password-match-success">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Passwords match!</span>
                  </div>
                )}
              </div>

              {resetMsg && (
                <div className={`forgot-msg ${resetMsg.startsWith("✅") ? "success" : "error"}`} style={{ marginBottom: "12px" }}>
                  {resetMsg}
                </div>
              )}

              <button
                type="submit"
                className="login-submit-btn"
                style={{ background: accentGradient, boxShadow: `0 4px 12px ${accentShadow}` }}
                disabled={!isNewPwValid() || !newPasswordsMatch || !sentCode || resetLoading}
              >
                {resetLoading ? (
                  <>
                    <svg className="spinner" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Resetting...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                    Reset Password
                  </>
                )}
              </button>

              <div className="divider"><span>OR</span></div>
              <div className="signup-section">
                <p>
                  <button type="button" className="signup-link" style={{ color: accentColor }} onClick={() => setView("login")}>
                    ← Back to Login
                  </button>
                </p>
              </div>
            </form>
          </>

        ) : (
          <>
            <div className="login-modal-header">
              <div className="login-icon" style={{ background: accentGradient, boxShadow: `0 10px 25px ${accentShadow}` }}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                </svg>
              </div>
              <h2 style={{ background: accentGradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                Welcome Back!
              </h2>
              <p className="login-subtitle">Log in to your DKMerch account</p>
            </div>

            <form onSubmit={handleSubmit} className="login-form">
              {/* ── Lockout warning banner ── */}
              {isLockedOut && (
                <div className="error-banner lockout-banner">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  <span>
                    Too many failed attempts. Try again in{" "}
                    <strong>{formatCooldown(loginCooldown)}</strong>
                  </span>
                </div>
              )}

              {error && !isLockedOut && (
                <div className="error-banner">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <div className="input-group">
                <label htmlFor="email">Email / Username</label>
                <div className="input-wrapper">
                  <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                  </svg>
                  <input
                    type="text" id="email" name="email"
                    placeholder="Enter your email or username"
                    className="form-input"
                    value={formData.email}
                    onChange={handleChange}
                    required autoComplete="username"
                    disabled={isLockedOut}
                  />
                </div>
              </div>

              <div className="input-group">
                <label htmlFor="password">Password</label>
                <div className="input-wrapper">
                  <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  <input
                    type={showPassword ? "text" : "password"} id="password" name="password"
                    placeholder="Enter your password"
                    className="form-input password-input"
                    value={formData.password}
                    onChange={handleChange}
                    required autoComplete="current-password"
                    disabled={isLockedOut}
                  />
                  <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>
                    <PwToggleIcon show={showPassword} />
                  </button>
                </div>
              </div>

              {/* Attempts warning (before lockout) */}
              {!isLockedOut && loginAttempts >= 3 && loginAttempts < 5 && (
                <div className="login-attempts-warning">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>Warning: {5 - loginAttempts} attempt{5 - loginAttempts !== 1 ? "s" : ""} left before temporary lockout</span>
                </div>
              )}

              <div className="forgot-password-wrapper">
                <button type="button" className="forgot-password-link" style={{ color: accentColor }} onClick={() => setView("forgot")}>
                  Forgot Password?
                </button>
              </div>

              <button
                type="submit"
                className={`login-submit-btn ${isLockedOut ? "locked-out" : ""}`}
                style={{
                  background: isLockedOut ? "#9ca3af" : accentGradient,
                  boxShadow: isLockedOut ? "none" : `0 4px 12px ${accentShadow}`
                }}
                disabled={isLoading || isLockedOut}
              >
                {isLockedOut ? (
                  <>
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                    Locked — {formatCooldown(loginCooldown)}
                  </>
                ) : isLoading ? (
                  <>
                    <svg className="spinner" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Logging in...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Log In
                  </>
                )}
              </button>

              <div className="divider"><span>OR</span></div>
              <div className="signup-section">
                <p>New to DKMerch?{" "}<button type="button" className="signup-link" onClick={handleSwitchToRegister}>Create an account</button></p>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default LoginModal;