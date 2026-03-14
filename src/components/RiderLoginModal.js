// src/components/RiderLoginModal.js
import React, { useState, useEffect } from "react";
import "./LoginModal.css";
import "./RiderLoginModal.css";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import RiderRegistrationModal from "./RiderRegistrationModal";

// ── Rate limit helpers ─────────────────────────────────────────────────────
const RL_KEY_ATTEMPTS = "dkmerch_rider_login_attempts";
const RL_KEY_LOCKOUT  = "dkmerch_rider_login_lockout_until";
const BASE_LOCKOUT    = 60;
const EXTRA_PER_FAIL  = 30;

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
  if (attempts >= 5) lockoutSecs = BASE_LOCKOUT + Math.max(0, attempts - 5) * EXTRA_PER_FAIL;
  if (lockoutSecs > 0) sessionStorage.setItem(RL_KEY_LOCKOUT, Date.now() + lockoutSecs * 1000);
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
const formatCooldown = (secs) => {
  if (secs >= 60) { const m = Math.floor(secs / 60), s = secs % 60; return s > 0 ? `${m}m ${s}s` : `${m}m`; }
  return `${secs}s`;
};
// ──────────────────────────────────────────────────────────────────────────

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

const RiderLoginModal = ({ onClose, onLoginSuccess }) => {
  const { login } = useAuth();
  const navigate  = useNavigate();

  // view: "login" | "forgot" | "register"
  const [view, setView] = useState("login");

  // ── Login state ──────────────────────────────────────────────
  const [formData, setFormData]           = useState({ email: "", password: "" });
  const [showPassword, setShowPassword]   = useState(false);
  const [isLoading, setIsLoading]         = useState(false);
  const [error, setError]                 = useState("");
  const [loginCooldown, setLoginCooldown] = useState(0);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [pwTouched, setPwTouched]         = useState(false);

  // ── Forgot password state ─────────────────────────────────────
  const [forgotEmail, setForgotEmail]         = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [newPassword, setNewPassword]         = useState("");
  const [confirmNewPw, setConfirmNewPw]       = useState("");
  const [sentCode, setSentCode]               = useState("");
  const [sendingCode, setSendingCode]         = useState(false);
  const [codeMsg, setCodeMsg]                 = useState("");
  const [resetMsg, setResetMsg]               = useState("");
  const [resetLoading, setResetLoading]       = useState(false);
  const [pwCooldown, setPwCooldown]           = useState(0);
  const [pwAttempts, setPwAttempts]           = useState(0);
  const [showNewPw, setShowNewPw]             = useState(false);
  const [showConfirmPw, setShowConfirmPw]     = useState(false);

  const resetPasswordByEmail  = useMutation(api.riders.resetRiderPasswordByEmail);
  const sendPasswordResetCode = useAction(api.sendEmail.sendPasswordResetCode);

  // ── Restore lockout on mount ──────────────────────────────────
  useEffect(() => {
    const remaining = getRemainingLockout();
    const { attempts } = getRLState();
    if (remaining > 0) { setLoginCooldown(remaining); setLoginAttempts(attempts); }
  }, []);

  // ── Tick cooldowns ────────────────────────────────────────────
  useEffect(() => {
    if (loginCooldown <= 0) return;
    const t = setTimeout(() => setLoginCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [loginCooldown]);

  useEffect(() => {
    if (pwCooldown <= 0) return;
    const t = setTimeout(() => setPwCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [pwCooldown]);

  // ── Body scroll lock ──────────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.body.classList.add("login-modal-open");
    return () => {
      document.body.style.overflow = "";
      document.body.classList.remove("login-modal-open");
    };
  }, []);

  // ── Reset forgot form when switching to it ────────────────────
  useEffect(() => {
    if (view === "forgot") {
      setForgotEmail(""); setVerificationCode(""); setNewPassword("");
      setConfirmNewPw(""); setSentCode(""); setCodeMsg("");
      setResetMsg(""); setPwCooldown(0); setPwAttempts(0);
    }
  }, [view]);

  // ── Password validation ───────────────────────────────────────
  const validateRiderPassword = (pw) => {
    if (!pw) return [];
    const errors = [];
    if (!pw.startsWith("@rider")) errors.push("Must start with @rider");
    if (pw.length < 7)            errors.push("At least 7 characters");
    if (pw.length > 10)           errors.push("Maximum 10 characters");
    return errors;
  };

  const getPwStrength = (pw) => {
    if (!pw) return null;
    if (pw.startsWith("@rider") && pw.length >= 7 && pw.length <= 10) return "valid";
    if (pw.startsWith("@rider")) return "partial";
    return "invalid";
  };

  const pwErrors   = validateRiderPassword(formData.password);
  const pwStrength = getPwStrength(formData.password);

  // New password for reset — same @rider rule
  const newPwErrors   = validateRiderPassword(newPassword);
  const newPwStrength = getPwStrength(newPassword);
  const newPwsMatch   = confirmNewPw && newPassword === confirmNewPw;

  const isLockedOut = loginCooldown > 0;

  // ── Handlers ──────────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    const finalValue = name === "password" ? value.slice(0, 10) : value;
    setFormData(prev => ({ ...prev, [name]: finalValue }));
    if (error && !isLockedOut) setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const remaining = getRemainingLockout();
    if (remaining > 0) {
      setLoginCooldown(remaining);
      setError(`Too many failed attempts. Please wait ${formatCooldown(remaining)}.`);
      return;
    }
    if (pwErrors.length > 0) { setError(`Password: ${pwErrors[0]}`); return; }
    setIsLoading(true);
    try {
      const result = await login(formData.email, formData.password, "rider");
      if (!result.success) {
        const { attempts, lockoutSecs } = recordFailedAttempt();
        setLoginAttempts(attempts);
        if (lockoutSecs > 0) {
          setLoginCooldown(lockoutSecs);
          setError(`Too many failed attempts. Please wait ${formatCooldown(lockoutSecs)}.`);
        } else {
          const left = 5 - attempts;
          setError(left > 0
            ? `${result.message} (${left} attempt${left !== 1 ? "s" : ""} left before lockout)`
            : result.message);
        }
        return;
      }
      resetRLState();
      setLoginAttempts(0);
      setLoginCooldown(0);
      if (onLoginSuccess) { onLoginSuccess("rider"); }
      else { navigate("/rider", { replace: true }); onClose(); }
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Forgot: send code ─────────────────────────────────────────
  const handleSendCode = async () => {
    if (pwCooldown > 0) return;
    if (!forgotEmail.trim() || !/\S+@\S+\.\S+/.test(forgotEmail)) {
      setCodeMsg("❌ Please enter a valid email address.");
      return;
    }
    if (pwAttempts >= 3) {
      setCodeMsg("❌ Maximum attempts reached. Try again later.");
      setPwCooldown(300); setPwAttempts(0); return;
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setSentCode(code); setSendingCode(true); setCodeMsg("");
    try {
      const result = await sendPasswordResetCode({
        to: forgotEmail, code, accountType: "rider",
      });
      if (result?.success) {
        setCodeMsg(`✅ Code sent to ${forgotEmail}! Check your inbox.`);
      } else {
        setCodeMsg(`❌ Failed to send: ${result?.message || "Unknown error"}`);
        setSentCode("");
      }
    } catch {
      setCodeMsg("❌ Failed to send email."); setSentCode("");
    } finally {
      setSendingCode(false);
      const cooldown = pwAttempts === 0 ? 60 : pwAttempts === 1 ? 120 : 180;
      setPwCooldown(cooldown); setPwAttempts(prev => prev + 1);
    }
  };

  // ── Forgot: reset password ─────────────────────────────────────
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetMsg("");
    if (!sentCode)                      { setResetMsg("❌ Please request a verification code first."); return; }
    if (verificationCode !== sentCode)  { setResetMsg("❌ Invalid verification code."); return; }
    if (newPwErrors.length > 0)         { setResetMsg(`❌ Password: ${newPwErrors[0]}`); return; }
    if (!newPwsMatch)                   { setResetMsg("❌ Passwords do not match."); return; }
    setResetLoading(true);
    try {
      const result = await resetPasswordByEmail({ email: forgotEmail, newPassword });
      if (result?.success) {
        setResetMsg("✅ Password reset! You can now log in.");
        setTimeout(() => setView("login"), 1500);
      } else {
        setResetMsg(`❌ ${result?.message || "No rider account found with that email."}`);
      }
    } catch {
      setResetMsg("❌ Failed to reset password. Please try again.");
    } finally {
      setResetLoading(false);
    }
  };

  // ── Show registration modal ───────────────────────────────────
  if (view === "register") {
    return (
      <RiderRegistrationModal
        onClose={() => setView("login")}
        onSubmitSuccess={() => setView("login")}
      />
    );
  }

  // ═══════════════════════════════════════════
  // FORGOT PASSWORD VIEW
  // ═══════════════════════════════════════════
  if (view === "forgot") {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="login-modal-content" onClick={e => e.stopPropagation()}>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="login-modal-header">
            <div className="login-icon rider-icon-mode">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
              </svg>
            </div>
            <h2 className="rider-login-title">Reset Rider Password</h2>
            <p className="login-subtitle">Enter your email to receive a reset code</p>
          </div>

          <form onSubmit={handleResetPassword} className="login-form">
            {/* Email */}
            <div className="input-group">
              <label>Email Address</label>
              <div className="input-wrapper">
                <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                </svg>
                <input type="email" placeholder="Enter your registered rider email"
                  className="form-input rider-form-input"
                  value={forgotEmail}
                  onChange={e => { setForgotEmail(e.target.value); setCodeMsg(""); }}
                  required />
              </div>
            </div>

            {/* Verification code */}
            <div className="input-group">
              <label>Verification Code</label>
              <div className="forgot-code-row">
                <div className="input-wrapper" style={{ flex: 1 }}>
                  <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  <input type="text" placeholder="Enter 6-digit code"
                    className="form-input rider-form-input"
                    value={verificationCode}
                    onChange={e => {
                      const digits = e.target.value.replace(/\D/g, "");
                      if (digits.length <= 6) setVerificationCode(digits);
                    }}
                    maxLength="6" required />
                </div>
                <button type="button" className="send-code-btn rider-send-code-btn"
                  onClick={handleSendCode}
                  disabled={pwCooldown > 0 || sendingCode}
                  style={{ background: (pwCooldown > 0 || sendingCode) ? "#d1d5db" : undefined }}>
                  {sendingCode ? "Sending..." : pwCooldown > 0 ? `Wait ${pwCooldown}s` : "Send Code"}
                </button>
              </div>
              {codeMsg && (
                <div className={`forgot-msg ${codeMsg.startsWith("✅") ? "success" : "error"}`}>
                  {codeMsg}
                </div>
              )}
            </div>

            {/* New password */}
            <div className="input-group">
              <label>New Password</label>
              <div className="input-wrapper">
                <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                <input type={showNewPw ? "text" : "password"}
                  placeholder="@rider + up to 4 characters"
                  className="form-input password-input rider-form-input"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value.slice(0, 10))}
                  maxLength={10} required />
                <button type="button" className="password-toggle" onClick={() => setShowNewPw(p => !p)}>
                  <PwToggleIcon show={showNewPw} />
                </button>
              </div>
              {newPassword && (
                <div className={`rider-pw-hint-box ${newPwStrength}`}>
                  {newPwStrength === "valid"   && <><span className="rider-pw-hint-icon">✅</span> Password looks good!</>}
                  {newPwStrength === "partial" && <><span className="rider-pw-hint-icon">⚠️</span> Add more chars after @rider</>}
                  {newPwStrength === "invalid" && <><span className="rider-pw-hint-icon">❌</span> Must start with <strong>@rider</strong></>}
                </div>
              )}
              <div className="rider-pw-rules-box">
                <div className={`rider-pw-rule ${newPassword.startsWith("@rider") ? "ok" : ""}`}>
                  {newPassword.startsWith("@rider") ? "✅" : "○"} Starts with <strong>@rider</strong>
                </div>
                <div className={`rider-pw-rule ${newPassword.length >= 7 && newPassword.length <= 10 ? "ok" : ""}`}>
                  {newPassword.length >= 7 && newPassword.length <= 10 ? "✅" : "○"} 7–10 characters
                </div>
              </div>
            </div>

            {/* Confirm new password */}
            <div className="input-group">
              <label>Confirm New Password</label>
              <div className="input-wrapper">
                <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                <input type={showConfirmPw ? "text" : "password"}
                  placeholder="Re-enter your new password"
                  className={`form-input password-input rider-form-input ${newPwsMatch ? "valid" : ""}`}
                  value={confirmNewPw}
                  onChange={e => setConfirmNewPw(e.target.value.slice(0, 10))}
                  maxLength={10} required />
                <button type="button" className="password-toggle" onClick={() => setShowConfirmPw(p => !p)}>
                  <PwToggleIcon show={showConfirmPw} />
                </button>
              </div>
              {newPwsMatch && (
                <div className="password-match-success">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Passwords match!</span>
                </div>
              )}
            </div>

            {resetMsg && (
              <div className={`forgot-msg ${resetMsg.startsWith("✅") ? "success" : "error"}`}
                style={{ marginBottom: 12 }}>
                {resetMsg}
              </div>
            )}

            <button type="submit" className="login-submit-btn rider-submit-mode"
              disabled={!sentCode || newPwErrors.length > 0 || !newPwsMatch || resetLoading}>
              {resetLoading ? (
                <><svg className="spinner" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>Resetting...</>
              ) : (
                <><svg viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>Reset Password</>
              )}
            </button>

            <div className="divider"><span>OR</span></div>
            <div className="signup-section">
              <p>
                <button type="button" className="forgot-password-link rider-forgot-link"
                  onClick={() => setView("login")}>
                  ← Back to Login
                </button>
              </p>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // LOGIN VIEW
  // ═══════════════════════════════════════════
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="login-modal-content" onClick={e => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="login-modal-header">
          <div className="login-icon rider-icon-mode">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 7c0-1.1-.9-2-2-2h-3L12 2H8L6 5H3C1.9 5 1 5.9 1 7v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7zM10 4h4l1 1h-6l1-1zm2 13c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.65 0-3 1.35-3 3s1.35 3 3 3 3-1.35 3-3-1.35-3-3-3z"/>
            </svg>
          </div>
          <h2 className="rider-login-title">Rider Login</h2>
          <p className="login-subtitle">Access your DKMerch rider dashboard</p>
          <div className="rider-mode-badge">🛵 Rider Portal</div>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {/* Lockout banner */}
          {isLockedOut && (
            <div className="error-banner lockout-banner">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <span>Too many failed attempts. Try again in <strong>{formatCooldown(loginCooldown)}</strong></span>
            </div>
          )}

          {/* Error */}
          {error && !isLockedOut && (
            <div className="error-banner">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Email */}
          <div className="input-group">
            <label htmlFor="rider-email">Email Address</label>
            <div className="input-wrapper">
              <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
              </svg>
              <input type="email" id="rider-email" name="email"
                placeholder="Enter your registered email"
                className="form-input rider-form-input"
                value={formData.email} onChange={handleChange}
                required autoComplete="username" disabled={isLockedOut} />
            </div>
          </div>

          {/* Password */}
          <div className="input-group">
            <label htmlFor="rider-password">Password</label>
            <div className="input-wrapper">
              <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <input type={showPassword ? "text" : "password"} id="rider-password" name="password"
                placeholder="@rider + up to 4 characters"
                className="form-input password-input rider-form-input"
                value={formData.password} onChange={handleChange}
                onFocus={() => setPwTouched(true)}
                required autoComplete="current-password"
                disabled={isLockedOut} maxLength={10} />
              <button type="button" className="password-toggle" onClick={() => setShowPassword(p => !p)}>
                <PwToggleIcon show={showPassword} />
              </button>
            </div>
            {pwTouched && formData.password && (
              <div className={`rider-pw-hint-box ${pwStrength}`}>
                {pwStrength === "valid"   && <><span className="rider-pw-hint-icon">✅</span> Password looks good!</>}
                {pwStrength === "partial" && <><span className="rider-pw-hint-icon">⚠️</span> Add more chars after @rider</>}
                {pwStrength === "invalid" && <><span className="rider-pw-hint-icon">❌</span> Must start with <strong>@rider</strong></>}
              </div>
            )}
            {pwTouched && (
              <div className="rider-pw-rules-box">
                <div className={`rider-pw-rule ${formData.password.startsWith("@rider") ? "ok" : ""}`}>
                  {formData.password.startsWith("@rider") ? "✅" : "○"} Starts with <strong>@rider</strong>
                </div>
                <div className={`rider-pw-rule ${formData.password.length >= 7 && formData.password.length <= 10 ? "ok" : ""}`}>
                  {formData.password.length >= 7 && formData.password.length <= 10 ? "✅" : "○"} 7–10 characters
                </div>
              </div>
            )}
          </div>

          {/* Attempts warning */}
          {!isLockedOut && loginAttempts >= 3 && loginAttempts < 5 && (
            <div className="login-attempts-warning">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>Warning: {5 - loginAttempts} attempt{5 - loginAttempts !== 1 ? "s" : ""} left before lockout</span>
            </div>
          )}

          {/* Forgot password link */}
          <div className="forgot-password-wrapper">
            <button type="button" className="forgot-password-link rider-forgot-link"
              onClick={() => setView("forgot")}>
              Forgot Password?
            </button>
          </div>

          {/* Submit */}
          <button type="submit"
            className={`login-submit-btn rider-submit-mode ${isLockedOut ? "locked-out" : ""}`}
            disabled={isLoading || isLockedOut}>
            {isLockedOut ? (
              <><svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>Locked — {formatCooldown(loginCooldown)}</>
            ) : isLoading ? (
              <><svg className="spinner" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Logging in...</>
            ) : (
              <><svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clipRule="evenodd" /></svg>Log In as Rider</>
            )}
          </button>

          <div className="divider"><span>OR</span></div>
          <div className="signup-section">
            <p>
              New rider?{" "}
              <button type="button" className="signup-link rider-signup-link"
                onClick={() => setView("register")}>
                Apply / Create Account
              </button>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RiderLoginModal;