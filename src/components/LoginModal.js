// src/components/LoginModal.js
import React, { useState, useEffect, useRef } from "react";
import "./LoginModal.css";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { hasLocalPin, savePinWithFallback, verifyPinWithFallback, clearLocalPin } from "../lib/localPin";
// Static import — lazy chunk breaks Create Account after HMR / stale builds
import RegisterModal from "./RegisterModal";

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

// ── PIN reset OTP (cooldown + code survive close + refresh) ──────────────────
const PIN_OTP_COOLDOWN_SECS = 60;
const PIN_OTP_CODE_TTL_MS = 1000 * 60 * 10; // 10 minutes to enter the emailed code
const pinOtpCooldownKey = (userId) => `dkmerch_pin_otp_until_${userId || "anon"}`;
const pinOtpCodeKey = (userId) => `dkmerch_pin_otp_code_${userId || "anon"}`;

function startPinOtpCooldown(userId, secs = PIN_OTP_COOLDOWN_SECS) {
  if (!userId) return secs;
  const until = Date.now() + secs * 1000;
  try { localStorage.setItem(pinOtpCooldownKey(userId), String(until)); } catch {}
  return secs;
}

function getPinOtpCooldownRemaining(userId) {
  if (!userId) return 0;
  try {
    const until = parseInt(localStorage.getItem(pinOtpCooldownKey(userId)) || "0", 10);
    if (!until) return 0;
    const rem = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    if (rem <= 0) localStorage.removeItem(pinOtpCooldownKey(userId));
    return rem;
  } catch {
    return 0;
  }
}

function savePinResetOtpCode(userId, code) {
  if (!userId || !code) return;
  try {
    localStorage.setItem(
      pinOtpCodeKey(userId),
      JSON.stringify({ code, expiresAt: Date.now() + PIN_OTP_CODE_TTL_MS })
    );
  } catch {}
}

function readPinResetOtpCode(userId) {
  if (!userId) return "";
  try {
    const raw = localStorage.getItem(pinOtpCodeKey(userId));
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    if (!parsed?.code || !parsed?.expiresAt || Date.now() > parsed.expiresAt) {
      localStorage.removeItem(pinOtpCodeKey(userId));
      return "";
    }
    return String(parsed.code);
  } catch {
    return "";
  }
}

function clearPinResetOtpCode(userId) {
  if (!userId) return;
  try { localStorage.removeItem(pinOtpCodeKey(userId)); } catch {}
}
// ─────────────────────────────────────────────────────────────────────────────

const LoginModal = ({ onClose, onLoginSuccess }) => {
  const { login, completeLogin } = useAuth();
  const navigate = useNavigate();

  // view: "login" | "pin" | "loginOtp" | "createPin" | "forgot" | "reactivate"
  const [view, setView] = useState("login");
  const [pendingUser, setPendingUser] = useState(null);
  const [pinValue, setPinValue] = useState("");
  const [pinConfirmValue, setPinConfirmValue] = useState("");
  const [pinStep, setPinStep] = useState(0); // 0 = enter new, 1 = confirm (set/reset only)
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState("");
  const [loginOtpDigits, setLoginOtpDigits] = useState(["", "", "", "", "", ""]);
  const [loginOtpLoading, setLoginOtpLoading] = useState(false);
  const [loginOtpError, setLoginOtpError] = useState("");
  const [loginOtpMsg, setLoginOtpMsg] = useState("");
  const [loginOtpCooldown, setLoginOtpCooldown] = useState(0);
  const [isPinReset, setIsPinReset] = useState(false);
  const [accountHasPin, setAccountHasPin] = useState(false);
  const [pinResetSentCode, setPinResetSentCode] = useState(""); // client fallback when Convex PIN OTP isn't deployed
  const [pinResetSending, setPinResetSending] = useState(false);
  const pinInputRef = useRef(null);
  const loginOtpRefs = useRef([]);

  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showRegister, setShowRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // ── Rate limit state ──
  const [loginCooldown, setLoginCooldown] = useState(0);
  const [loginAttempts, setLoginAttempts] = useState(0);

  // ── Forgot password state ──
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

  // ── Reactivation state ──
  const [reactivateEmail, setReactivateEmail]       = useState("");
  const [reactivateUserName, setReactivateUserName] = useState("");
  const [reactivateOtp, setReactivateOtp]           = useState("");
  const [reactivateSentOtp, setReactivateSentOtp]   = useState("");
  const [reactivateMsg, setReactivateMsg]           = useState("");
  const [reactivateSending, setReactivateSending]   = useState(false);
  const [reactivateLoading, setReactivateLoading]   = useState(false);
  const [reactivateCooldown, setReactivateCooldown] = useState(0);
  const [reactivateStep, setReactivateStep]         = useState(0); // 0=confirm, 1=send code, 2=enter code

  const resetPasswordByEmail  = useMutation(api.users.resetPasswordByEmail);
  const sendPasswordResetCode = useAction(api.sendEmail.sendPasswordResetCode);
  const generateReactivationOtp = useMutation(api.users.generateReactivationOtp);
  const reactivateAccount     = useMutation(api.users.reactivateAccount);
  const sendReactivationOTP   = useAction(api.sendEmail.sendReactivationOTP);
  const verifyLoginPin        = useMutation(api.users.verifyLoginPin);
  const setUserPin            = useMutation(api.users.setUserPin);
  const generateLoginOtp      = useMutation(api.users.generateLoginOtp);
  const verifyLoginOtp        = useMutation(api.users.verifyLoginOtp);
  const clearUserPinAfterOtp  = useMutation(api.users.clearUserPinAfterOtp);
  const sendLoginOTP          = useAction(api.sendEmail.sendLoginOTP);
  // sendPasswordResetCode is already deployed + working — used as PIN-reset email fallback

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

  // ── Tick down reactivation cooldown ──
  useEffect(() => {
    if (reactivateCooldown <= 0) return;
    const t = setTimeout(() => setReactivateCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [reactivateCooldown]);

  // Tick PIN-OTP cooldown + restore emailed code (survives close/refresh)
  useEffect(() => {
    if (!pendingUser?._id) return undefined;
    const uid = pendingUser._id;
    const savedCode = readPinResetOtpCode(uid);
    if (savedCode) setPinResetSentCode(savedCode);
    const tick = () => setLoginOtpCooldown(getPinOtpCooldownRemaining(uid));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [pendingUser?._id]);

  useEffect(() => {
    if (view === "pin" || view === "createPin") {
      setTimeout(() => pinInputRef.current?.focus(), 80);
    }
    if (view === "loginOtp") {
      setTimeout(() => loginOtpRefs.current[0]?.focus(), 80);
    }
  }, [view, pinStep]);

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
      setForgotEmail(""); setVerificationCode(""); setNewPassword("");
      setConfirmNewPassword(""); setSentCode(""); setCodeMsg("");
      setResetMsg(""); setPasswordCooldown(0); setPasswordAttempts(0);
    }
    if (view === "reactivate") {
      setReactivateOtp(""); setReactivateMsg("");
      setReactivateSentOtp(""); setReactivateCooldown(0);
      setReactivateStep(0);
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

  // ── LOGIN SUBMIT ──────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const remaining = getRemainingLockout();
    if (remaining > 0) {
      setLoginCooldown(remaining);
      setError(`Too many failed attempts. Please wait ${formatCooldown(remaining)}.`);
      return;
    }

    setIsLoading(true);
    try {
      const result = await login(formData.email, formData.password, "user");

      // ── Deactivated account → show reactivation flow ──
      if (!result.success && result.deactivated) {
        setReactivateEmail(result.userEmail || formData.email);
        setReactivateUserName(result.userName || "");
        setView("reactivate");
        setIsLoading(false);
        return;
      }

      if (!result.success) {
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
          const rem = 5 - attempts;
          setError(
            rem > 0
              ? `${result.message} (${rem} attempt${rem !== 1 ? "s" : ""} left before lockout)`
              : result.message
          );
        }
        return;
      }

      resetRLState();
      setLoginAttempts(0);
      setLoginCooldown(0);

      // Customer: password OK → ALWAYS Enter PIN next (never jump to Create PIN)
      if (result.pendingUser && result.role === "user") {
        setPendingUser(result.pendingUser);
        setIsPinReset(false);
        setAccountHasPin(!!(result.needsPin || hasLocalPin(result.pendingUser._id)));
        setPinValue("");
        setPinConfirmValue("");
        setPinStep(0);
        setPinError("");
        setView("pin");
        return;
      }

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

  const finishLogin = (role) => {
    if (onLoginSuccess) onLoginSuccess(role);
    else onClose();
  };

  const sanitizePinInput = (raw) => String(raw || "").replace(/\D/g, "").slice(0, 6);

  const openSetNewPin = () => {
    if (pendingUser?._id) clearLocalPin(pendingUser._id);
    setPinValue("");
    setPinConfirmValue("");
    setPinStep(0);
    setPinError("");
    setView("createPin");
  };

  const handleVerifyPin = async () => {
    const pin = pinValue;
    if (!pendingUser?._id) return;
    if (!accountHasPin && !hasLocalPin(pendingUser._id)) {
      setPinError("No PIN yet — tap Reset PIN below to create one.");
      return;
    }
    if (pin.length < 4) {
      setPinError("Enter your PIN to continue.");
      return;
    }
    setPinLoading(true);
    setPinError("");
    try {
      const checked = await verifyPinWithFallback(verifyLoginPin, pendingUser._id, pin);
      if (!checked.success) {
        setPinError(
          checked.needsPinSetup
            ? "No PIN yet — tap Reset PIN below to create one."
            : (checked.message || "Incorrect PIN.")
        );
        setPinValue("");
        return;
      }
      setAccountHasPin(true);
      const done = completeLogin(
        checked.result?.user || pendingUser,
        checked.source === "local" ? "Login with local PIN" : "Login with PIN"
      );
      finishLogin(done.role);
    } catch {
      setPinError("Incorrect PIN. Try again, or tap Reset PIN.");
    } finally {
      setPinLoading(false);
    }
  };

  const emailPinResetOtp = async (to, name, code) => {
    // 1) Prefer dedicated login OTP email if deployed
    try {
      const r = await sendLoginOTP({ to, name, otp: code });
      if (r?.success) return { success: true };
    } catch {}
    // 2) Same working email action as Forgot Password
    try {
      const r = await sendPasswordResetCode({ to, code, name });
      if (r?.success) return { success: true };
      return { success: false, message: r?.message || "Failed to send email." };
    } catch (err) {
      return { success: false, message: String(err?.message || "Failed to send email.") };
    }
  };

  const issuePinResetOtp = async () => {
    if (!pendingUser?._id || !pendingUser?.email) {
      return { success: false, message: "Account email missing." };
    }
    let code = Math.floor(100000 + Math.random() * 900000).toString();
    let name = pendingUser.name || "there";
    let email = pendingUser.email;

    // Prefer server-stored OTP when Convex PIN APIs are deployed
    try {
      const otpRes = await generateLoginOtp({ userId: pendingUser._id, resetPin: true });
      if (otpRes?.success && otpRes.otp) {
        code = otpRes.otp;
        name = otpRes.name || name;
        email = otpRes.email || email;
      }
    } catch {
      // keep client-generated code
    }

    const mailed = await emailPinResetOtp(email, name, code);
    if (!mailed.success) {
      return { success: false, message: mailed.message || "Failed to send OTP email." };
    }
    setPinResetSentCode(code);
    savePinResetOtpCode(pendingUser._id, code);
    return { success: true, email };
  };

  const handleForgotPin = async () => {
    if (!pendingUser?._id) return;
    setIsPinReset(true);
    setLoginOtpError("");
    setLoginOtpDigits(["", "", "", "", "", ""]);
    setView("loginOtp");

    const remaining = getPinOtpCooldownRemaining(pendingUser._id);
    if (remaining > 0) {
      setLoginOtpCooldown(remaining);
      setLoginOtpMsg(`⏳ Please wait ${remaining}s before requesting another code.`);
      return;
    }

    setLoginOtpMsg("");
    setPinResetSentCode("");
    clearPinResetOtpCode(pendingUser._id);
    setPinResetSending(true);
    try {
      const sent = await issuePinResetOtp();
      if (sent.success) {
        const secs = startPinOtpCooldown(pendingUser._id);
        setLoginOtpCooldown(secs);
        setLoginOtpMsg(`✅ Reset code sent to ${sent.email || pendingUser.email}`);
      } else {
        setLoginOtpError(sent.message || "Could not send OTP. Please tap Resend.");
      }
    } catch {
      setLoginOtpError("Could not send OTP. Please tap Resend.");
    } finally {
      setPinResetSending(false);
    }
  };

  const handleResendLoginOtp = async () => {
    if (!pendingUser?._id || pinResetSending) return;
    const remaining = getPinOtpCooldownRemaining(pendingUser._id);
    if (remaining > 0) {
      setLoginOtpCooldown(remaining);
      return;
    }
    setLoginOtpError("");
    setPinResetSending(true);
    try {
      const sent = await issuePinResetOtp();
      if (sent.success) {
        const secs = startPinOtpCooldown(pendingUser._id);
        setLoginOtpDigits(["", "", "", "", "", ""]);
        setLoginOtpCooldown(secs);
        setLoginOtpMsg("✅ New code sent! Check your inbox.");
      } else {
        setLoginOtpError(sent.message || "Failed to resend OTP.");
      }
    } catch {
      setLoginOtpError("Failed to resend OTP.");
    } finally {
      setPinResetSending(false);
    }
  };

  const handleVerifyLoginOtp = async () => {
    const otp = loginOtpDigits.join("");
    if (otp.length !== 6 || !pendingUser?._id) {
      setLoginOtpError("Enter the 6-digit code from your email.");
      return;
    }
    setLoginOtpLoading(true);
    setLoginOtpError("");
    try {
      // Server verify when loginOtp was stored on the user
      try {
        const result = await verifyLoginOtp({ userId: pendingUser._id, otp });
        if (result?.success) {
          try { await clearUserPinAfterOtp({ userId: pendingUser._id }); } catch {}
          clearPinResetOtpCode(pendingUser._id);
          setPinResetSentCode("");
          openSetNewPin();
          return;
        }
      } catch {}

      // Persisted client OTP (survives refresh) + in-memory fallback
      const expected = pinResetSentCode || readPinResetOtpCode(pendingUser._id);
      if (expected && otp === expected) {
        try { await clearUserPinAfterOtp({ userId: pendingUser._id }); } catch {}
        clearLocalPin(pendingUser._id);
        clearPinResetOtpCode(pendingUser._id);
        setPinResetSentCode("");
        openSetNewPin();
        return;
      }

      if (!expected) {
        setLoginOtpError("Code expired or lost after refresh. Tap Resend for a new OTP.");
      } else {
        setLoginOtpError("Incorrect code. Check your email and try again.");
      }
    } catch {
      setLoginOtpError("Verification failed. Check the code and try again.");
    } finally {
      setLoginOtpLoading(false);
    }
  };

  const handleSaveLoginPin = async () => {
    const pin = pinValue;
    const confirm = pinConfirmValue;
    if (pin.length < 4) {
      setPinError("Enter a PIN with at least 4 digits.");
      return;
    }
    if (pinStep === 0) {
      setPinStep(1);
      setPinConfirmValue("");
      setTimeout(() => pinInputRef.current?.focus(), 80);
      return;
    }
    if (pin !== confirm) {
      setPinError("PINs do not match.");
      setPinConfirmValue("");
      setTimeout(() => pinInputRef.current?.focus(), 80);
      return;
    }
    setPinLoading(true);
    setPinError("");
    try {
      const saved = await savePinWithFallback(setUserPin, pendingUser._id, pin);
      if (!saved.success) {
        setPinError(saved.message || "Failed to save PIN.");
        return;
      }
      const done = completeLogin(pendingUser, isPinReset ? "PIN reset" : "Login + PIN created");
      finishLogin(done.role);
    } catch (err) {
      setPinError(String(err?.message || "Failed to save PIN.").slice(0, 140));
    } finally {
      setPinLoading(false);
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

  // ── FORGOT PASSWORD ───────────────────────────────────────────────────────
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
      const result = await sendPasswordResetCode({ to: forgotEmail, code });
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
    if (!isNewPwValid()) { setResetMsg("❌ Password does not meet all requirements."); return; }
    if (!newPasswordsMatch) { setResetMsg("❌ Passwords do not match."); return; }

    setResetLoading(true);
    try {
      const result = await resetPasswordByEmail({ email: forgotEmail, newPassword });
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

  // ── REACTIVATION ──────────────────────────────────────────────────────────
  const handleSendReactivationOtp = async () => {
    if (reactivateCooldown > 0) return;
    setReactivateSending(true);
    setReactivateMsg("");
    try {
      // Generate OTP in DB
      const result = await generateReactivationOtp({ email: reactivateEmail });
      if (!result.success) {
        setReactivateMsg(`❌ ${result.message}`);
        setReactivateSending(false);
        return;
      }
      // Send OTP via email
      const emailResult = await sendReactivationOTP({
        to: reactivateEmail,
        name: reactivateUserName || result.userName || "there",
        otp: result.otp,
      });
      if (emailResult?.success) {
        setReactivateSentOtp(result.otp);
        setReactivateStep(2);
        setReactivateMsg(`✅ Verification code sent to ${reactivateEmail}!`);
        setReactivateCooldown(60);
      } else {
        setReactivateMsg("❌ Failed to send email. Please try again.");
      }
    } catch {
      setReactivateMsg("❌ Something went wrong. Please try again.");
    } finally {
      setReactivateSending(false);
    }
  };

  const handleReactivate = async (e) => {
    e.preventDefault();
    setReactivateMsg("");
    if (!reactivateSentOtp) { setReactivateMsg("❌ Please request a verification code first."); return; }
    if (reactivateOtp.length !== 6) { setReactivateMsg("❌ Please enter the full 6-digit code."); return; }

    setReactivateLoading(true);
    try {
      const result = await reactivateAccount({ email: reactivateEmail, otp: reactivateOtp });
      if (result.success) {
        // ── Don't auto-login — send back to login view so they log in manually ──
        setReactivateMsg("✅ Account reactivated! Please log in to continue.");
        setTimeout(() => {
          setView("login");
          setFormData({ email: "", password: "" });
          setError("✅ Account reactivated successfully! Please log in.");
        }, 1500);
      } else {
        setReactivateMsg(`❌ ${result.message}`);
        if (result.expired) {
          setReactivateSentOtp("");
          setReactivateStep(0);
        }
      }
    } catch {
      setReactivateMsg("❌ Failed to reactivate. Please try again.");
    } finally {
      setReactivateLoading(false);
    }
  };

  if (showRegister) {
    return <RegisterModal onClose={handleRegisterSuccess} />;
  }

  const isLockedOut = loginCooldown > 0;

  // ════════════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════════════
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="login-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* ── REACTIVATION VIEW ─────────────────────────────────────── */}
        {view === "reactivate" && (
          <>
            <div className="login-modal-header">
              <div className="login-icon" style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", boxShadow: "0 10px 25px rgba(34,197,94,0.3)" }}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                </svg>
              </div>
              <h2 style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                Reactivate Account
              </h2>
              <p className="login-subtitle">
                {reactivateStep === 0 ? "Your account is deactivated" : `Verification code sent to ${reactivateEmail}`}
              </p>
            </div>

            <form onSubmit={handleReactivate} className="login-form">

              {/* ── STEP 0: Confirmation ── */}
              {reactivateStep === 0 && (
                <>
                  <div className="reactivate-confirm-card">
                    <div className="reactivate-confirm-icon">
                      <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 28, height: 28, color: "#16a34a" }}>
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                      </svg>
                    </div>
                    <div className="reactivate-confirm-info">
                      <div className="reactivate-confirm-label">Account</div>
                      <div className="reactivate-confirm-value">{reactivateEmail}</div>
                    </div>
                  </div>

                  <div className="reactivate-info-banner" style={{ marginBottom: 24 }}>
                    <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 18, height: 18, flexShrink: 0, color: "#0369a1" }}>
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <span>
                      Are you sure you want to reactivate this account? We'll send a 6-digit verification code to <strong>{reactivateEmail}</strong> to confirm your identity.
                    </span>
                  </div>

                  <button
                    type="button"
                    className="login-submit-btn"
                    style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", boxShadow: "0 4px 12px rgba(34,197,94,0.35)" }}
                    onClick={() => setReactivateStep(1)}
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 20, height: 20 }}>
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Yes, Reactivate My Account
                  </button>
                </>
              )}

              {/* ── STEP 1: Send code ── */}
              {reactivateStep === 1 && (
                <div style={{ marginBottom: 24 }}>
                  <div className="reactivate-info-banner" style={{ marginBottom: 20 }}>
                    <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 18, height: 18, flexShrink: 0, color: "#0369a1" }}>
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <span>Click the button below to send a 6-digit code to <strong>{reactivateEmail}</strong>.</span>
                  </div>
                  <button
                    type="button"
                    className="login-submit-btn"
                    style={{
                      background: reactivateCooldown > 0 || reactivateSending ? "#9ca3af" : "linear-gradient(135deg, #22c55e, #16a34a)",
                      boxShadow: reactivateCooldown > 0 ? "none" : "0 4px 12px rgba(34,197,94,0.35)",
                    }}
                    onClick={handleSendReactivationOtp}
                    disabled={reactivateCooldown > 0 || reactivateSending}
                  >
                    {reactivateSending ? (
                      <><svg className="spinner" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Sending...</>
                    ) : reactivateCooldown > 0 ? (
                      `Resend in ${reactivateCooldown}s`
                    ) : (
                      <><svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 20, height: 20 }}><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>Send Verification Code</>
                    )}
                  </button>
                  {reactivateMsg && (
                    <div className={`forgot-msg ${reactivateMsg.startsWith("✅") ? "success" : "error"}`} style={{ marginTop: 12 }}>
                      {reactivateMsg}
                    </div>
                  )}
                </div>
              )}

              {/* ── STEP 2: Enter code ── */}
              {reactivateStep === 2 && (
                <>
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
                          value={reactivateOtp}
                          onChange={(e) => {
                            const d = e.target.value.replace(/\D/g, "");
                            if (d.length <= 6) setReactivateOtp(d);
                          }}
                          maxLength="6"
                          required
                          autoFocus
                        />
                      </div>
                      <button
                        type="button"
                        className="send-code-btn"
                        style={{ background: reactivateCooldown > 0 ? "#d1d5db" : "linear-gradient(135deg, #22c55e, #16a34a)" }}
                        onClick={handleSendReactivationOtp}
                        disabled={reactivateCooldown > 0 || reactivateSending}
                      >
                        {reactivateSending ? "Sending..." : reactivateCooldown > 0 ? `${reactivateCooldown}s` : "Resend"}
                      </button>
                    </div>
                    {reactivateMsg && (
                      <div className={`forgot-msg ${reactivateMsg.startsWith("✅") ? "success" : "error"}`} style={{ marginTop: 10 }}>
                        {reactivateMsg}
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="login-submit-btn"
                    style={{
                      background: reactivateLoading ? "#9ca3af" : "linear-gradient(135deg, #22c55e, #16a34a)",
                      boxShadow: "0 4px 12px rgba(34,197,94,0.35)",
                    }}
                    disabled={reactivateOtp.length !== 6 || reactivateLoading}
                  >
                    {reactivateLoading ? (
                      <><svg className="spinner" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Reactivating...</>
                    ) : (
                      <><svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 20, height: 20 }}><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>Reactivate My Account</>
                    )}
                  </button>
                </>
              )}

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
        )}

        {/* ── FORGOT PASSWORD VIEW ──────────────────────────────────── */}
        {view === "forgot" && (
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
                    <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
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
                    <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
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
                  <><svg className="spinner" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Resetting...</>
                ) : (
                  <><svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>Reset Password</>
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
        )}

        {/* ── PIN LOGIN ────────────────────────────────────────────── */}
        {view === "pin" && (
          <>
            <div className="login-modal-header">
              <div className="login-icon" style={{ background: accentGradient, boxShadow: `0 10px 25px ${accentShadow}` }}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 17a2 2 0 100-4 2 2 0 000 4zm6-7h-1V7a5 5 0 00-10 0v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2zM9 7a3 3 0 016 0v3H9V7z"/>
                </svg>
              </div>
              <h2 style={{ background: accentGradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                Enter Your PIN to Continue
              </h2>
              <p className="login-subtitle">
                {accountHasPin
                  ? `Hi ${pendingUser?.name || "there"} — enter your PIN to start shopping.`
                  : `Hi ${pendingUser?.name || "there"} — tap Reset PIN to create your shopping PIN.`}
              </p>
            </div>
            <div className="login-form">
              <div className="input-group">
                <label htmlFor="login-pin">PIN</label>
                <div className="input-wrapper">
                  <svg className="input-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 17a2 2 0 100-4 2 2 0 000 4zm6-7h-1V7a5 5 0 00-10 0v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2zM9 7a3 3 0 016 0v3H9V7z"/>
                  </svg>
                  <input
                    id="login-pin"
                    ref={pinInputRef}
                    className="form-input password-input pin-secret-input"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="Enter PIN"
                    value={pinValue}
                    onChange={(e) => {
                      setPinValue(sanitizePinInput(e.target.value));
                      setPinError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleVerifyPin();
                    }}
                    disabled={pinLoading}
                    style={pinError ? { borderColor: "#dc2626" } : undefined}
                  />
                </div>
              </div>
              {pinError && (
                <div className={`error-banner${pinError.includes("Reset PIN") ? " pin-hint-banner" : ""}`}>
                  {pinError}
                </div>
              )}
              <button
                type="button"
                className="login-submit-btn"
                onClick={handleVerifyPin}
                disabled={pinLoading || (accountHasPin && pinValue.length < 4)}
                style={{ background: accentGradient, boxShadow: `0 4px 12px ${accentShadow}`, color: "#fff" }}
              >
                {pinLoading ? "Checking…" : "Continue to Shop"}
              </button>
              <div className="signup-section" style={{ marginTop: 0 }}>
                <p>
                  <button type="button" className="signup-link" style={{ color: accentColor }} onClick={handleForgotPin}>
                    Reset PIN
                  </button>
                </p>
                <p>
                  <button type="button" className="signup-link" style={{ color: "#9ca3af" }} onClick={() => { setView("login"); setPendingUser(null); }}>
                    ← Back
                  </button>
                </p>
              </div>
            </div>
          </>
        )}

        {/* ── LOGIN OTP (PIN setup / forgot PIN) ───────────────────── */}
        {view === "loginOtp" && (
          <>
            <div className="login-modal-header">
              <div className="login-icon" style={{ background: accentGradient, boxShadow: `0 10px 25px ${accentShadow}` }}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                </svg>
              </div>
              <h2 style={{ background: accentGradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                Reset Your PIN
              </h2>
              <p className="login-subtitle">
                {pinResetSending
                  ? `Sending OTP to ${pendingUser?.email || "your email"}…`
                  : loginOtpMsg
                    ? `OTP sent to ${pendingUser?.email || "your email"}. Paste it below, then set a new PIN.`
                    : `We’ll email an OTP to ${pendingUser?.email || "your registered email"}. Paste it here to continue.`}
              </p>
            </div>
            <div className="login-form">
              {loginOtpMsg && <div className="error-banner success-banner">{loginOtpMsg}</div>}
              <div className="input-group">
                <label htmlFor="login-otp">Email OTP</label>
                <div className="input-wrapper">
                  <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                  </svg>
                  <input
                    id="login-otp"
                    ref={el => { loginOtpRefs.current[0] = el; }}
                    className="form-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="Paste 6-digit code"
                    maxLength={6}
                    value={loginOtpDigits.join("")}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/\D/g, "").slice(0, 6);
                      const next = ["", "", "", "", "", ""];
                      for (let i = 0; i < cleaned.length; i++) next[i] = cleaned[i];
                      setLoginOtpDigits(next);
                      setLoginOtpError("");
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
                      const next = ["", "", "", "", "", ""];
                      for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
                      setLoginOtpDigits(next);
                      setLoginOtpError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleVerifyLoginOtp();
                    }}
                    disabled={loginOtpLoading || pinResetSending}
                    style={loginOtpError ? { borderColor: "#dc2626" } : undefined}
                  />
                </div>
              </div>
              {loginOtpError && <div className="error-banner">{loginOtpError}</div>}
              <button
                type="button"
                className="login-submit-btn"
                onClick={handleVerifyLoginOtp}
                disabled={loginOtpLoading || pinResetSending || loginOtpDigits.join("").length !== 6}
                style={{ background: accentGradient, boxShadow: `0 4px 12px ${accentShadow}`, color: "#fff" }}
              >
                {loginOtpLoading ? "Verifying…" : "Verify & Set New PIN"}
              </button>
              <div className="signup-section" style={{ marginTop: 0 }}>
                <p>
                  <button type="button" className="signup-link" style={{ color: (loginOtpCooldown > 0 || pinResetSending) ? "#9ca3af" : accentColor }}
                    disabled={loginOtpCooldown > 0 || pinResetSending} onClick={handleResendLoginOtp}>
                    {pinResetSending ? "Sending…" : loginOtpCooldown > 0 ? `Resend in ${loginOtpCooldown}s` : "Resend OTP to email"}
                  </button>
                </p>
              </div>
            </div>
          </>
        )}

        {/* ── SET / RESET PIN (after OTP or device fallback) ───────── */}
        {view === "createPin" && (
          <>
            <div className="login-modal-header">
              <div className="login-icon" style={{ background: accentGradient, boxShadow: `0 10px 25px ${accentShadow}` }}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 17a2 2 0 100-4 2 2 0 000 4zm6-7h-1V7a5 5 0 00-10 0v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2zM9 7a3 3 0 016 0v3H9V7z"/>
                </svg>
              </div>
              <h2 style={{ background: accentGradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                {pinStep === 0 ? (isPinReset ? "Set New PIN" : "Create Your PIN") : "Confirm Your PIN"}
              </h2>
              <p className="login-subtitle">
                {pinStep === 0
                  ? "Enter a PIN you’ll use after password on every login"
                  : "Re-enter the same PIN to confirm"}
              </p>
            </div>
            <div className="login-form">
              <div className="input-group">
                <label htmlFor="set-login-pin">{pinStep === 0 ? "New PIN" : "Confirm PIN"}</label>
                <div className="input-wrapper">
                  <svg className="input-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 17a2 2 0 100-4 2 2 0 000 4zm6-7h-1V7a5 5 0 00-10 0v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2zM9 7a3 3 0 016 0v3H9V7z"/>
                  </svg>
                  <input
                    id="set-login-pin"
                    key={`set-pin-${pinStep}`}
                    ref={pinInputRef}
                    className="form-input password-input pin-secret-input"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="••••••"
                    value={pinStep === 0 ? pinValue : pinConfirmValue}
                    onChange={(e) => {
                      const next = sanitizePinInput(e.target.value);
                      if (pinStep === 0) setPinValue(next);
                      else setPinConfirmValue(next);
                      setPinError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveLoginPin();
                    }}
                    disabled={pinLoading}
                    style={pinError ? { borderColor: "#dc2626" } : undefined}
                  />
                </div>
              </div>
              {pinError && <div className="error-banner">{pinError}</div>}
              <button
                type="button"
                className="login-submit-btn"
                onClick={handleSaveLoginPin}
                disabled={pinLoading || (pinStep === 0 ? pinValue.length < 4 : pinConfirmValue.length < 4)}
                style={{ background: accentGradient, boxShadow: `0 4px 12px ${accentShadow}`, color: "#fff" }}
              >
                {pinLoading ? "Saving…" : pinStep === 0 ? "Continue" : "Save PIN & Continue"}
              </button>
              {pinStep === 1 && (
                <div className="signup-section" style={{ marginTop: 0 }}>
                  <p>
                    <button type="button" className="signup-link" style={{ color: "#9ca3af" }}
                      onClick={() => { setPinStep(0); setPinConfirmValue(""); setTimeout(() => pinInputRef.current?.focus(), 80); }}>
                      ← Edit PIN
                    </button>
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── LOGIN VIEW ───────────────────────────────────────────── */}
        {view === "login" && (
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
              {isLockedOut && (
                <div className="error-banner lockout-banner">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  <span>Too many failed attempts. Try again in <strong>{formatCooldown(loginCooldown)}</strong></span>
                </div>
              )}

              {error && !isLockedOut && (
                <div className={`error-banner ${error.startsWith("✅") ? "success-banner" : ""}`}>
                  {error.startsWith("✅") ? (
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span>{error.startsWith("✅") ? error.replace("✅ ", "") : error}</span>
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
                  <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)}>
                    <PwToggleIcon show={showPassword} />
                  </button>
                </div>
              </div>

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
                  <><svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>Locked — {formatCooldown(loginCooldown)}</>
                ) : isLoading ? (
                  <><svg className="spinner" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Logging in...</>
                ) : (
                  <><svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clipRule="evenodd" /></svg>Log In</>
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