// src/components/LoginModal.js
import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import "./LoginModal.css";
import {
  useAuth,
  readPendingLogin,
  writePendingLogin,
  clearPendingLogin,
} from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useMutation, useAction, useQuery, useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import { QRCodeSVG } from "qrcode.react";
import { hasLocalPin, getLocalPinLength, savePinWithFallback, verifyPinWithFallback, clearLocalPin } from "../lib/localPin";
import { getDeviceUnlock } from "../lib/deviceUnlock";
import {
  readAuthGate,
  writeAuthGate,
  clearAuthGate,
  readAuthGateStep,
  writeAuthGateStep,
} from "../lib/authGate";
import { guessLocation } from "../utils/deviceInfo";
import { PRODUCTION_SITE_URL } from "./InstallAppModal";
import { useNotification } from "../context/NotificationContext";
import { useCloseOnHistoryBack } from "../hooks/useCloseOnHistoryBack";
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import { getOverlayRoot } from "../utils/scrollLock";
// Static import — lazy chunk breaks Create Account after HMR / stale builds
import RegisterModal from "./RegisterModal";
import { WaitingApprovalModal, LoginDeniedModal } from "./LoginApprovalModals";

function formatQuickSignInCode(token) {
  const t = String(token || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (t.length === 8) return `${t.slice(0, 4)}-${t.slice(4)}`;
  return t;
}

/** QR is only for desktop login (phone scans it). Mobile uses the code in Settings. */
function canGenerateQuickSignInQr() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iphone|ipod|android.+mobile|windows phone|mobile/i.test(ua)) return false;
  // iPad / large tablets still count as mobile hosts for this flow
  if (/ipad|android(?!.*mobile)|tablet/i.test(ua)) return false;
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return false;
  return true;
}

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

// ── PIN unlock lockout: 5 fails → 1min, then 5, 10, 20 min ───────────────────
const PIN_FAIL_LIMIT = 5;
const PIN_LOCK_MINUTES = [1, 5, 10, 20]; // escalating wait after each lockout
const pinFailKey = (userId) => `dkmerch_pin_fails_${userId || "anon"}`;
const pinLockKey = (userId) => `dkmerch_pin_lock_until_${userId || "anon"}`;
const pinLockLevelKey = (userId) => `dkmerch_pin_lock_level_${userId || "anon"}`;

function getPinFailCount(userId) {
  try { return parseInt(localStorage.getItem(pinFailKey(userId)) || "0", 10) || 0; }
  catch { return 0; }
}

function getPinLockLevel(userId) {
  try { return parseInt(localStorage.getItem(pinLockLevelKey(userId)) || "0", 10) || 0; }
  catch { return 0; }
}

function getPinLockRemaining(userId) {
  try {
    const until = parseInt(localStorage.getItem(pinLockKey(userId)) || "0", 10) || 0;
    if (!until) return 0;
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
  } catch { return 0; }
}

function clearPinFailState(userId) {
  if (!userId) return;
  try {
    localStorage.removeItem(pinFailKey(userId));
    localStorage.removeItem(pinLockKey(userId));
    // keep lock level so next lockout still escalates across sessions
  } catch { /* ignore */ }
}

function resetPinLockEscalation(userId) {
  if (!userId) return;
  try {
    localStorage.removeItem(pinFailKey(userId));
    localStorage.removeItem(pinLockKey(userId));
    localStorage.removeItem(pinLockLevelKey(userId));
  } catch { /* ignore */ }
}

/** Record wrong PIN. Returns { fails, remaining, lockoutSecs }. */
function recordPinFail(userId) {
  const fails = getPinFailCount(userId) + 1;
  try { localStorage.setItem(pinFailKey(userId), String(fails)); } catch { /* ignore */ }
  let lockoutSecs = 0;
  if (fails >= PIN_FAIL_LIMIT) {
    const level = getPinLockLevel(userId);
    const mins = PIN_LOCK_MINUTES[Math.min(level, PIN_LOCK_MINUTES.length - 1)];
    lockoutSecs = mins * 60;
    try {
      localStorage.setItem(pinLockKey(userId), String(Date.now() + lockoutSecs * 1000));
      localStorage.setItem(pinLockLevelKey(userId), String(level + 1));
      localStorage.setItem(pinFailKey(userId), "0");
    } catch { /* ignore */ }
  }
  return {
    fails: fails >= PIN_FAIL_LIMIT ? 0 : fails,
    remaining: fails >= PIN_FAIL_LIMIT ? 0 : PIN_FAIL_LIMIT - fails,
    lockoutSecs,
  };
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

const LoginModal = ({ onClose, onLoginSuccess, preferPinUnlock = false, onClearUnlockPrompt, onSwitchAccount }) => {
  const { login, completeLogin, finalizePendingLogin, logout } = useAuth();
  const { showNotification } = useNotification();
  const navigate = useNavigate();
  const convex = useConvex();
  const portalRoot = () => getOverlayRoot() || document.body;

  // view: "login" | "pin" | "loginOtp" | "createPin" | "forgot" | "reactivate" | "quickSignIn"
  // PIN-first only when installed app cold-start asks for unlock — not every Brave open
  // Stable ref — getDeviceUnlock() returns a new object every call (JSON.parse)
  const remembered = useMemo(() => {
    try { return getDeviceUnlock(); } catch { return null; }
  }, []);
  const rememberedId = remembered?._id ? String(remembered._id) : "";
  const rememberedLocalPin = !!(rememberedId && hasLocalPin(rememberedId));
  const restoredPending = useMemo(() => {
    try { return readPendingLogin(); } catch { return null; }
  }, []);
  const savedGate = useMemo(() => readAuthGate(), []);
  const restoreSwitch = savedGate === "switch";
  const restoreReset = savedGate === "reset";
  // Cold-start unlock: show pink PIN immediately when app asks for it
  // (unless user was on Use another account / Reset PIN and hard-refreshed)
  const startUnlockUi =
    !!(preferPinUnlock && remembered?._id)
    && !restoredPending
    && !restoreSwitch
    && !restoreReset;
  const startWithPin = !!(startUnlockUi && rememberedLocalPin);
  /** Block closing / browsing until login succeeds (PIN gate or Use another account). */
  const [mustAuthenticate, setMustAuthenticate] = useState(
    !!preferPinUnlock || !!restoredPending || restoreSwitch || restoreReset
  );
  const [view, setView] = useState(
    restoreReset ? "forgot" : restoreSwitch ? "login" : startUnlockUi ? "pin" : "login"
  );
  const [qsiToken, setQsiToken] = useState("");
  const [qsiExpiresAt, setQsiExpiresAt] = useState(0);
  const [qsiCreating, setQsiCreating] = useState(false);
  const [qsiError, setQsiError] = useState("");
  const [qsiDone, setQsiDone] = useState(false);
  const [qsiNonce, setQsiNonce] = useState(0);
  const qsiFinishingRef = useRef(false);
  const [qsiDesktopHost] = useState(() => canGenerateQuickSignInQr());
  const [pendingUser, setPendingUser] = useState(
    restoreSwitch ? null : (startUnlockUi || restoreReset ? remembered : null)
  );
  const [deviceUnlockMode, setDeviceUnlockMode] = useState(startUnlockUi);
  /** Pink full-screen login after "Use another account" (stays in PIN-page chrome) */
  const [switchAccountMode, setSwitchAccountMode] = useState(restoreSwitch);
  /** Pink Reset PIN wizard — Gmail → OTP → new PIN */
  const [resetPasswordMode, setResetPasswordMode] = useState(restoreReset);
  /** 0=email, 1=code, 2=new PIN, 3=confirm PIN */
  const [resetPinStep, setResetPinStep] = useState(() => (
    restoreReset ? readAuthGateStep() : 0
  ));
  /** Waiting for Yes on the other device */
  const [awaitingApproval, setAwaitingApproval] = useState(() => (
    restoredPending?.userId && restoredPending?.sessionId
      ? {
          userId: String(restoredPending.userId),
          sessionId: String(restoredPending.sessionId),
          user: restoredPending.user,
          expiresAt: restoredPending.expiresAt || (Number(restoredPending.at) || Date.now()) + 60_000,
        }
      : null
  ));
  const [loginDenied, setLoginDenied] = useState(false);
  const [denyReason, setDenyReason] = useState(null); // 'timeout' | 'blocked' | null
  /** Remember who to restore when tapping Back from Use another account */
  const [pinAccountSnapshot, setPinAccountSnapshot] = useState(
    (startUnlockUi || restoreSwitch || restoreReset) ? remembered : null
  );

  // Persist current gate so hard refresh stays on Use another account / Reset PIN / PIN
  useEffect(() => {
    if (resetPasswordMode) {
      writeAuthGate("reset");
      writeAuthGateStep(resetPinStep);
    } else if (switchAccountMode) {
      writeAuthGate("switch");
    } else if (deviceUnlockMode && view === "pin") {
      writeAuthGate("pin");
    }
  }, [resetPasswordMode, switchAccountMode, deviceUnlockMode, view, resetPinStep]);
  const [pinValue, setPinValue] = useState("");
  const [pinConfirmValue, setPinConfirmValue] = useState("");
  const [pinStep, setPinStep] = useState(0); // 0 = enter new, 1 = confirm (set/reset only)
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pinCooldown, setPinCooldown] = useState(0); // seconds left when PIN pad is locked
  const [pinFailsLeft, setPinFailsLeft] = useState(PIN_FAIL_LIMIT);
  const [loginOtpDigits, setLoginOtpDigits] = useState(["", "", "", "", "", ""]);
  const [loginOtpLoading, setLoginOtpLoading] = useState(false);
  const [loginOtpError, setLoginOtpError] = useState("");
  const [loginOtpMsg, setLoginOtpMsg] = useState("");
  const [loginOtpCooldown, setLoginOtpCooldown] = useState(0);
  const [isPinReset, setIsPinReset] = useState(false);
  // Device unlock = already finished email+password+PIN once on this phone
  const [accountHasPin, setAccountHasPin] = useState(startUnlockUi);
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
  const [forgotEmail, setForgotEmail] = useState(
    restoreReset ? String(remembered?.email || "").trim() : ""
  );
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
  /** 'deactivated' | 'deleted' — copy for recovery flow */
  const [reactivateKind, setReactivateKind]         = useState("deactivated");
  const [recoverUntil, setRecoverUntil]             = useState(null);

  const resetPasswordByEmail  = useMutation(api.users.resetPasswordByEmail);
  const sendPasswordResetCode = useAction(api.sendEmail.sendPasswordResetCode);
  const generateReactivationOtp = useMutation(api.users.generateReactivationOtp);
  const reactivateAccount     = useMutation(api.users.reactivateAccount);
  const sendReactivationOTP   = useAction(api.sendEmail.sendReactivationOTP);
  const createQuickSignIn     = useMutation(api.quickSignIn.createSession);
  const consumeQuickSignIn    = useMutation(api.quickSignIn.consumeSession);
  const quickSignInSession    = useQuery(
    api.quickSignIn.getSession,
    view === "quickSignIn" && qsiToken ? { token: qsiToken } : "skip"
  );
  const verifyLoginPin        = useMutation(api.users.verifyLoginPin);
  const setUserPin            = useMutation(api.users.setUserPin);
  const unlockPinStatus       = useQuery(
    api.users.hasLoginPin,
    preferPinUnlock && remembered?._id && !rememberedLocalPin
      ? { userId: String(remembered._id) }
      : "skip"
  );
  const loginApprovalStatus   = useQuery(
    api.users.getLoginApprovalStatus,
    awaitingApproval?.userId && awaitingApproval?.sessionId
      ? { userId: String(awaitingApproval.userId), sessionId: String(awaitingApproval.sessionId) }
      : "skip"
  );
  const generateLoginOtp      = useMutation(api.users.generateLoginOtp);
  const verifyLoginOtp        = useMutation(api.users.verifyLoginOtp);
  const clearUserPinAfterOtp  = useMutation(api.users.clearUserPinAfterOtp);
  const cancelPendingLogin    = useMutation(api.users.cancelPendingLogin);
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

  // Prefetch location while user types PIN so login itself stays instant
  useEffect(() => {
    if (view !== "pin" && view !== "createPin" && !deviceUnlockMode) return;
    guessLocation().catch(() => {});
  }, [view, deviceUnlockMode]);

  useEffect(() => {
    if (view === "pin" || view === "createPin") {
      setTimeout(() => pinInputRef.current?.focus(), 80);
    }
    if (view === "loginOtp") {
      setTimeout(() => loginOtpRefs.current[0]?.focus(), 80);
    }
  }, [view, pinStep]);

  // App update / legacy: device unlock remembered but account never created a PIN yet
  // Never override Use another account / Reset PIN after hard refresh
  useEffect(() => {
    if (switchAccountMode || resetPasswordMode) return;
    if (!preferPinUnlock || !rememberedId || rememberedLocalPin) return;
    if (unlockPinStatus === undefined) return;
    if (unlockPinStatus?.hasPin) {
      setPendingUser((prev) => (prev?._id && String(prev._id) === rememberedId ? prev : remembered));
      setDeviceUnlockMode((v) => (v ? v : true));
      setAccountHasPin((v) => (v ? v : true));
      setView((v) => (v === "pin" ? v : "pin"));
      return;
    }
    // No PIN on account — require password, then Create PIN
    setDeviceUnlockMode((v) => (v ? false : v));
    setAccountHasPin((v) => (v ? false : v));
    setPendingUser((prev) => (prev == null ? prev : null));
    setView((v) => (v === "login" ? v : "login"));
  }, [preferPinUnlock, remembered, rememberedId, rememberedLocalPin, unlockPinStatus, switchAccountMode, resetPasswordMode]);

  useBodyScrollLock(true);

  useEffect(() => {
    document.body.classList.add("login-modal-open");
    return () => {
      document.body.classList.remove("login-modal-open");
    };
  }, []);

  useCloseOnHistoryBack(
    true,
    () => {
      // Never dump user on Home while PIN / switch / reset flows are open
      if (
        mustAuthenticate
        || preferPinUnlock
        || deviceUnlockMode
        || switchAccountMode
        || resetPasswordMode
      ) {
        return;
      }
      onClose?.();
    },
    "loginModal"
  );

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

  // PIN unlock lockout countdown + restore on account change
  useEffect(() => {
    const uid = pendingUser?._id;
    if (!uid || !(deviceUnlockMode && view === "pin")) return;
    const left = getPinLockRemaining(uid);
    setPinCooldown(left);
    const fails = getPinFailCount(uid);
    setPinFailsLeft(Math.max(0, PIN_FAIL_LIMIT - fails));
    if (left > 0) {
      setPinError(`Too many wrong PINs. Try again in ${formatCooldown(left)}.`);
    }
  }, [pendingUser?._id, deviceUnlockMode, view]);

  useEffect(() => {
    if (pinCooldown <= 0) return;
    const t = setTimeout(() => {
      setPinCooldown((c) => {
        const next = Math.max(0, c - 1);
        if (next <= 0) {
          setPinError("");
          const uid = pendingUser?._id;
          if (uid) setPinFailsLeft(PIN_FAIL_LIMIT - getPinFailCount(uid));
        }
        return next;
      });
    }, 1000);
    return () => clearTimeout(t);
  }, [pinCooldown, pendingUser?._id]);

  useEffect(() => {
    if (view !== "quickSignIn") return;
    // Mobile / tablet: never generate QR (code + Settings scanner only)
    if (!qsiDesktopHost) {
      setQsiCreating(false);
      setQsiToken("");
      setQsiError("");
      setQsiDone(false);
      return undefined;
    }
    let cancelled = false;
    qsiFinishingRef.current = false;
    const start = async () => {
      setQsiCreating(true);
      setQsiError("");
      setQsiDone(false);
      setQsiToken("");
      try {
        const result = await createQuickSignIn({});
        if (cancelled) return;
        if (!result?.success || !result.token) {
          setQsiError(result?.error || "Could not create Quick Sign In QR.");
          return;
        }
        setQsiToken(result.token);
        setQsiExpiresAt(result.expiresAt || Date.now() + 180000);
      } catch (err) {
        if (!cancelled) setQsiError(err?.message || "Could not create Quick Sign In QR.");
      } finally {
        if (!cancelled) setQsiCreating(false);
      }
    };
    start();
    return () => { cancelled = true; };
  }, [view, qsiNonce, createQuickSignIn, qsiDesktopHost]);

  // Auto-login + close QR modal as soon as mobile approves (do not cancel on poll re-renders)
  useEffect(() => {
    if (view !== "quickSignIn" || !qsiToken || qsiDone) return;
    const status = quickSignInSession?.status;
    if (status !== "approved" && status !== "consumed") return;
    if (qsiFinishingRef.current) return;
    qsiFinishingRef.current = true;

    const pending = {
      _id: quickSignInSession.userId,
      name: quickSignInSession.userName,
      username: quickSignInSession.username,
      email: quickSignInSession.userEmail,
      phone: quickSignInSession.phone || "",
      role: quickSignInSession.role || "user",
    };
    if (!pending._id) {
      qsiFinishingRef.current = false;
      setQsiError("Approved, but account data was missing. Generate a new QR.");
      return;
    }

    setQsiDone(true);
    showNotification(
      `QR scanned — signing in as ${pending.name || pending.email || "your account"}…`,
      "success"
    );

    (async () => {
      const result = await completeLogin(pending, "Quick Sign In (QR) success");
      if (!result?.success) {
        qsiFinishingRef.current = false;
        setQsiDone(false);
        setQsiError("Approved, but desktop login failed. Try again.");
        return;
      }
      try { await consumeQuickSignIn({ token: qsiToken }); } catch { /* ignore */ }
      resetRLState();
      if (result.pendingApproval) {
        beginAwaitingApproval(result);
        showNotification("Confirm this login on your other device.", "info");
        return;
      }
      showNotification(
        `Signed in as ${pending.name || pending.email || "customer"}`,
        "success"
      );
      onLoginSuccess?.(result.role || "user");
      onClose?.();
    })();
  }, [
    view,
    qsiToken,
    qsiDone,
    quickSignInSession?.status,
    quickSignInSession?.userId,
    quickSignInSession?.userName,
    quickSignInSession?.username,
    quickSignInSession?.userEmail,
    quickSignInSession?.phone,
    quickSignInSession?.role,
    completeLogin,
    consumeQuickSignIn,
    onLoginSuccess,
    onClose,
    showNotification,
  ]);

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

      // ── Deactivated / soft-deleted (within 30 days) → reactivation flow ──
      if (!result.success && result.deactivated) {
        setReactivateEmail(result.userEmail || formData.email);
        setReactivateUserName(result.userName || "");
        setReactivateKind("deactivated");
        setRecoverUntil(null);
        setReactivateStep(0);
        setReactivateOtp("");
        setReactivateSentOtp("");
        setReactivateMsg("");
        setView("reactivate");
        setIsLoading(false);
        return;
      }
      if (!result.success && result.deleted && result.recoverable) {
        setReactivateEmail(result.userEmail || formData.email);
        setReactivateUserName(result.userName || "");
        setReactivateKind("deleted");
        setRecoverUntil(result.recoverUntil || null);
        setReactivateStep(0);
        setReactivateOtp("");
        setReactivateSentOtp("");
        setReactivateMsg("");
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

      // Waiting for Yes on the other logged-in device
      if (result.pendingApproval) {
        beginAwaitingApproval({
          sessionId: result.sessionId,
          user: result.user || result.pendingUser,
          pendingApproval: true,
          expiresAt: result.expiresAt,
        });
        return;
      }

      // Customer + admin: password OK → Enter PIN / Create PIN (never skip — session starts after PIN)
      if (
        result.pendingUser
        && (result.role === "user" || result.role === "admin")
        && !result.pendingApproval
      ) {
        setPendingUser(result.pendingUser);
        setIsPinReset(false);
        const localPin = hasLocalPin(result.pendingUser._id);
        const hasPin = !!(result.needsPin || localPin);
        const needsSetup =
          (!!result.needsPinSetup && !localPin && !result.needsPin) || !hasPin;
        setAccountHasPin(hasPin && !needsSetup);
        setPinValue("");
        setPinConfirmValue("");
        setPinStep(0);
        setPinError("");
        setSwitchAccountMode(false);
        setView(needsSetup ? "createPin" : "pin");
        return;
      }

      // Rider (or any non-PIN success) — finish login
      if (result.success && (result.role === "rider" || onLoginSuccess)) {
        if (onLoginSuccess) onLoginSuccess(result.role);
        else onClose();
        return;
      }

      setError(result.message || "Login failed. Please try again.");
    } catch (err) {
      setError("Login failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const finishLogin = (role) => {
    clearAuthGate();
    setMustAuthenticate(false);
    if (onLoginSuccess) onLoginSuccess(role);
    else onClose();
  };

  const sanitizePinInput = (raw) => String(raw || "").replace(/\D/g, "").slice(0, 6);

  const appendPinDigit = (digit) => {
    if (pinCooldown > 0 || pinLoading) return;
    setPinError("");
    setPinValue((prev) => sanitizePinInput(`${prev}${digit}`));
  };

  const backspacePin = () => {
    if (pinCooldown > 0 || pinLoading) return;
    setPinError("");
    setPinValue((prev) => prev.slice(0, -1));
  };

  const openSetNewPin = () => {
    if (pendingUser?._id) clearLocalPin(pendingUser._id);
    setPinValue("");
    setPinConfirmValue("");
    setPinStep(0);
    setPinError("");
    setView("createPin");
  };

  const pinDigitCount = (() => {
    if (pendingUser?._id && hasLocalPin(pendingUser._id)) {
      return getLocalPinLength(pendingUser._id);
    }
    const fromServer = Number(unlockPinStatus?.pinLength);
    if (Number.isFinite(fromServer) && fromServer >= 4 && fromServer <= 6) return fromServer;
    return 6;
  })();

  const beginAwaitingApproval = (done) => {
    const at = Date.now();
    const payload = {
      userId: String(done.user?._id || pendingUser?._id),
      sessionId: String(done.sessionId),
      user: done.user || pendingUser,
      expiresAt: Number(done.expiresAt) || at + 60_000,
    };
    writePendingLogin({ ...payload, at });
    setAwaitingApproval(payload);
    setLoginDenied(false);
    setDenyReason(null);
    setMustAuthenticate(true);
    setPinValue("");
  };

  const handleVerifyPin = async () => {
    const pin = pinValue;
    if (!pendingUser?._id) return;
    const uid = String(pendingUser._id);
    const lockedFor = getPinLockRemaining(uid);
    if (lockedFor > 0) {
      setPinCooldown(lockedFor);
      setPinError(`Too many wrong PINs. Try again in ${formatCooldown(lockedFor)}.`);
      setPinValue("");
      return;
    }
    if (!accountHasPin && !hasLocalPin(pendingUser._id)) {
      setPinError("No PIN yet — tap Reset PIN below, or use another account.");
      return;
    }
    if (pin.length < 4) {
      setPinError("Enter your PIN to continue.");
      return;
    }
    if (pin.length !== pinDigitCount && pinDigitCount >= 4) {
      // Wait until full length is entered (auto-submit handles this)
      if (pin.length < pinDigitCount) return;
    }
    setPinLoading(true);
    setPinError("");
    try {
      const checked = await verifyPinWithFallback(verifyLoginPin, pendingUser._id, pin);
      if (!checked.success) {
        if (checked.needsPinSetup) {
          setPinError("No PIN yet — tap Reset PIN below, or use another account.");
          setPinValue("");
          return;
        }
        const { remaining, lockoutSecs } = recordPinFail(uid);
        setPinValue("");
        if (lockoutSecs > 0) {
          setPinCooldown(lockoutSecs);
          setPinFailsLeft(PIN_FAIL_LIMIT);
          setPinError(`Wrong PIN 5 times. Wait ${formatCooldown(lockoutSecs)} before trying again.`);
          return;
        }
        setPinFailsLeft(remaining);
        setPinError(
          `Incorrect PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} left before a ${PIN_LOCK_MINUTES[Math.min(getPinLockLevel(uid), PIN_LOCK_MINUTES.length - 1)]}-min lock.`
        );
        return;
      }
      resetPinLockEscalation(uid);
      setPinFailsLeft(PIN_FAIL_LIMIT);
      setPinCooldown(0);
      setAccountHasPin(true);
      const done = await completeLogin(
        checked.result?.user || pendingUser,
        checked.source === "local" ? "Login with local PIN" : "Login with PIN"
      );
      if (done?.pendingApproval) {
        beginAwaitingApproval(done);
        return;
      }
      setMustAuthenticate(false);
      finishLogin(done.role);
    } catch {
      const { remaining, lockoutSecs } = recordPinFail(uid);
      setPinValue("");
      if (lockoutSecs > 0) {
        setPinCooldown(lockoutSecs);
        setPinFailsLeft(PIN_FAIL_LIMIT);
        setPinError(`Wrong PIN 5 times. Wait ${formatCooldown(lockoutSecs)} before trying again.`);
      } else {
        setPinFailsLeft(remaining);
        setPinError(`Incorrect PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} left. Or tap Reset PIN.`);
      }
    } finally {
      setPinLoading(false);
    }
  };

  const switchToAnotherAccount = (e) => {
    try { e?.preventDefault?.(); e?.stopPropagation?.(); } catch { /* ignore */ }
    // Keep device-unlock profile so Back + app reopen still return to PIN
    const snap = pendingUser || remembered || (() => {
      try { return getDeviceUnlock(); } catch { return null; }
    })();
    if (snap?._id) setPinAccountSnapshot(snap);
    // Soft logout first, then lock modal open so we never fall through to Home
    setMustAuthenticate(true);
    setResetPasswordMode(false);
    setResetPinStep(0);
    setDeviceUnlockMode(false);
    setAccountHasPin(false);
    setPendingUser(null);
    setPinValue("");
    setPinError("");
    setError("");
    setFormData({ email: "", password: "" });
    setShowRegister(false);
    setSwitchAccountMode(true);
    setView("login");
    writeAuthGate("switch");
    try { logout?.({ keepDeviceUnlock: true }); } catch { /* ignore */ }
    try { onSwitchAccount?.(); } catch { /* ignore */ }
  };

  const backToPinFromSwitch = () => {
    const acc = pinAccountSnapshot || (() => {
      try { return getDeviceUnlock(); } catch { return null; }
    })();
    if (!acc?._id) {
      setSwitchAccountMode(false);
      setView("login");
      clearAuthGate();
      return;
    }
    setPendingUser(acc);
    setAccountHasPin(true);
    setDeviceUnlockMode(true);
    setSwitchAccountMode(false);
    setPinValue("");
    setPinError("");
    setError("");
    setFormData({ email: "", password: "" });
    setMustAuthenticate(true);
    setView("pin");
    writeAuthGate("pin");
  };

  const requestClose = () => {
    if (mustAuthenticate || preferPinUnlock) return;
    onClose?.();
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

  /** Open pink Reset PIN wizard — Gmail → OTP → new PIN (never navigates Home). */
  const openResetPassword = (e) => {
    try { e?.preventDefault?.(); e?.stopPropagation?.(); } catch { /* ignore */ }
    const acc = pendingUser || pinAccountSnapshot || remembered || (() => {
      try { return getDeviceUnlock(); } catch { return null; }
    })();
    if (acc?._id) setPinAccountSnapshot(acc);
    const email = String(acc?.email || pendingUser?.email || "").trim();
    setForgotEmail(email);
    setVerificationCode("");
    setSentCode("");
    setCodeMsg("");
    setResetMsg("");
    setPinValue("");
    setPinConfirmValue("");
    setPinError("");
    setResetPinStep(0);
    setIsPinReset(true);
    setSwitchAccountMode(false);
    setDeviceUnlockMode(false);
    setMustAuthenticate(true);
    setResetPasswordMode(true);
    setView("forgot");
    writeAuthGate("reset");
    writeAuthGateStep(0);
  };

  const backFromResetPassword = () => {
    if (resetPinStep > 0 && resetPinStep < 2) {
      setResetPinStep((s) => Math.max(0, s - 1));
      setCodeMsg("");
      setResetMsg("");
      setPinError("");
      return;
    }
    if (resetPinStep >= 2) {
      setResetPinStep(1);
      setPinValue("");
      setPinConfirmValue("");
      setPinError("");
      return;
    }
    setResetPasswordMode(false);
    setResetPinStep(0);
    setCodeMsg("");
    setResetMsg("");
    setPinValue("");
    setIsPinReset(false);
    const acc = pinAccountSnapshot || remembered || (() => {
      try { return getDeviceUnlock(); } catch { return null; }
    })();
    if (acc?._id) {
      setPendingUser(acc);
      setPinAccountSnapshot(acc);
      setDeviceUnlockMode(true);
      setAccountHasPin(true);
      setMustAuthenticate(true);
      setView("pin");
      writeAuthGate("pin");
      return;
    }
    setSwitchAccountMode(true);
    setView("login");
    writeAuthGate("switch");
  };

  const handleSendPinResetCode = async () => {
    if (passwordCooldown > 0 || sendingCode) return;
    const email = forgotEmail.trim().toLowerCase();
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setCodeMsg("❌ Enter the Gmail used on this account.");
      return;
    }
    setSendingCode(true);
    setCodeMsg("");
    setResetMsg("");
    try {
      let user = null;
      try {
        user = await convex.query(api.users.getUserByEmail, { email });
      } catch { /* ignore */ }
      if (!user?._id) {
        setCodeMsg("❌ No DKMerch account found with that Gmail.");
        return;
      }
      const safeUser = {
        _id: user._id,
        email: user.email,
        name: user.name,
        username: user.username,
        role: user.role || "user",
      };
      setPendingUser(safeUser);
      setPinAccountSnapshot(safeUser);

      let code = Math.floor(100000 + Math.random() * 900000).toString();
      let name = safeUser.name || "there";
      try {
        const otpRes = await generateLoginOtp({ userId: String(safeUser._id), resetPin: true });
        if (otpRes?.success && otpRes.otp) {
          code = otpRes.otp;
          name = otpRes.name || name;
        }
      } catch { /* client code fallback */ }

      const mailed = await emailPinResetOtp(email, name, code);
      if (!mailed.success) {
        setCodeMsg(`❌ ${mailed.message || "Failed to send code."}`);
        return;
      }
      setSentCode(code);
      setPinResetSentCode(code);
      savePinResetOtpCode(safeUser._id, code);
      setVerificationCode("");
      setResetPinStep(1);
      setCodeMsg(`✅ Code sent to ${email}. Check your inbox.`);
      showNotification(`PIN reset code sent to ${email}`, "success", { duration: 5000 });
      const cooldown = passwordAttempts === 0 ? 60 : passwordAttempts === 1 ? 120 : 180;
      setPasswordCooldown(cooldown);
      setPasswordAttempts((prev) => prev + 1);
    } catch {
      setCodeMsg("❌ Failed to send code. Try again.");
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyPinResetCode = async () => {
    const otp = verificationCode.trim();
    if (otp.length !== 6) {
      setResetMsg("❌ Enter the 6-digit code from your email.");
      return;
    }
    const uid = pendingUser?._id || pinAccountSnapshot?._id;
    if (!uid) {
      setResetMsg("❌ Account missing. Go back and enter your Gmail again.");
      return;
    }
    setResetLoading(true);
    setResetMsg("");
    try {
      let ok = false;
      try {
        const res = await verifyLoginOtp({ userId: String(uid), otp });
        if (res?.success) ok = true;
      } catch { /* local fallback */ }
      const expected = sentCode || pinResetSentCode || readPinResetOtpCode(uid);
      if (!ok && expected && otp === expected) ok = true;
      if (!ok) {
        setResetMsg("❌ Invalid code. Check your email and try again.");
        return;
      }
      try { await clearUserPinAfterOtp({ userId: String(uid) }); } catch { /* optional */ }
      clearLocalPin(uid);
      clearPinResetOtpCode(uid);
      setPinResetSentCode("");
      setSentCode("");
      setIsPinReset(true);
      setPinValue("");
      setPinConfirmValue("");
      setPinError("");
      setResetPinStep(2);
      setResetMsg("✅ Code verified. Enter your new 6-digit PIN.");
    } catch {
      setResetMsg("❌ Could not verify code.");
    } finally {
      setResetLoading(false);
    }
  };

  const appendResetPinDigit = (d) => {
    if (resetLoading) return;
    if (resetPinStep === 2) {
      setPinValue((prev) => (prev.length >= 6 ? prev : prev + d));
      setPinError("");
    } else if (resetPinStep === 3) {
      setPinConfirmValue((prev) => (prev.length >= 6 ? prev : prev + d));
      setPinError("");
    }
  };

  const backspaceResetPin = () => {
    if (resetPinStep === 2) setPinValue((p) => p.slice(0, -1));
    else if (resetPinStep === 3) setPinConfirmValue((p) => p.slice(0, -1));
  };

  const handleSaveResetPin = async () => {
    const uid = pendingUser?._id || pinAccountSnapshot?._id;
    if (!uid) {
      setPinError("Account missing. Start over.");
      return;
    }
    if (resetPinStep === 2) {
      if (pinValue.length !== 6) {
        setPinError("PIN must be exactly 6 digits.");
        return;
      }
      setResetPinStep(3);
      setPinConfirmValue("");
      setPinError("");
      setResetMsg("Re-type your new PIN to confirm.");
      return;
    }
    if (pinValue !== pinConfirmValue) {
      setPinError("PINs do not match. Try again.");
      setPinConfirmValue("");
      return;
    }
    setResetLoading(true);
    setPinError("");
    try {
      const saved = await savePinWithFallback(setUserPin, uid, pinValue);
      if (!saved.success) {
        setPinError(saved.message || "Failed to save PIN.");
        return;
      }
      showNotification("PIN updated. Enter it to unlock.", "success", { duration: 5000 });
      setResetPasswordMode(false);
      setResetPinStep(0);
      setIsPinReset(false);
      setPinValue("");
      setPinConfirmValue("");
      setDeviceUnlockMode(true);
      setAccountHasPin(true);
      setMustAuthenticate(true);
      setPendingUser(pendingUser || pinAccountSnapshot);
      setView("pin");
    } catch (err) {
      setPinError(String(err?.message || "Failed to save PIN.").slice(0, 140));
    } finally {
      setResetLoading(false);
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
    if (pin.length !== 6) {
      setPinError("PIN must be exactly 6 digits.");
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
      const done = await completeLogin(pendingUser, isPinReset ? "PIN reset" : "Login + PIN created");
      if (done?.pendingApproval) {
        beginAwaitingApproval(done);
        return;
      }
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
    const email = forgotEmail.trim().toLowerCase();
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
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
    setSendingCode(true);
    setCodeMsg("");
    setSentCode("");
    try {
      const result = await sendPasswordResetCode({ to: email, code });
      if (result?.success) {
        setForgotEmail(email);
        setSentCode(code);
        setCodeMsg(`✅ Code sent to ${email}! Check your inbox.`);
      } else if (result?.notFound) {
        setCodeMsg("❌ No registered account found with that email.");
      } else {
        setCodeMsg(`❌ Failed to send: ${result?.message || "Unknown error"}`);
      }
    } catch {
      setCodeMsg("❌ Failed to send email.");
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
      const result = await resetPasswordByEmail({
        email: forgotEmail.trim().toLowerCase(),
        newPassword,
      });
      if (result?.success) {
        setResetMsg("✅ Password reset successful! You can now log in.");
        setTimeout(() => {
          setForgotEmail(""); setVerificationCode(""); setNewPassword("");
          setConfirmNewPassword(""); setSentCode(""); setCodeMsg("");
          setResetMsg("");
          if (resetPasswordMode) {
            setResetPasswordMode(false);
            setSwitchAccountMode(true);
            setView("login");
          } else {
            setView("login");
          }
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
        const recovered = reactivateKind === "deleted";
        setReactivateMsg(recovered
          ? "✅ Account recovered! Please log in to continue."
          : "✅ Account reactivated! Please log in to continue.");
        setTimeout(() => {
          setView("login");
          setFormData({ email: "", password: "" });
          setError(recovered
            ? "✅ Account recovered successfully! Please log in."
            : "✅ Account reactivated successfully! Please log in.");
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

  const isLockedOut = loginCooldown > 0;

  // PIN pad: auto-submit when full length entered (unlock + post-password PIN)
  useEffect(() => {
    if (view !== "pin") return;
    if (pinLoading || pinCooldown > 0) return;
    if (pinValue.length !== pinDigitCount) return;
    const t = setTimeout(() => { handleVerifyPin(); }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinValue, view, pinLoading, pinDigitCount, pinCooldown]);

  // Reset-PIN pad: auto-continue when 6 digits entered
  useEffect(() => {
    if (!resetPasswordMode || resetLoading) return;
    if (resetPinStep === 2 && pinValue.length === 6) {
      const t = setTimeout(() => { handleSaveResetPin(); }, 120);
      return () => clearTimeout(t);
    }
    if (resetPinStep === 3 && pinConfirmValue.length === 6) {
      const t = setTimeout(() => { handleSaveResetPin(); }, 120);
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetPasswordMode, resetPinStep, pinValue, pinConfirmValue, resetLoading]);

  // Poll other-device approval for pending login
  useEffect(() => {
    if (!awaitingApproval || loginDenied) return;
    const status = loginApprovalStatus?.status;
    if (!status || status === "pending") return;
    if (status === "approved") {
      const userPayload = awaitingApproval.user;
      clearPendingLogin();
      setAwaitingApproval(null);
      try {
        finalizePendingLogin?.(userPayload, "Login approved on other device");
      } catch { /* ignore */ }
      setMustAuthenticate(false);
      finishLogin(userPayload?.role || "user");
      return;
    }
    if (status === "denied" || status === "expired") {
      clearPendingLogin();
      setDenyReason(status === "expired" ? "timeout" : "blocked");
      setLoginDenied(true);
      return;
    }
    if (status === "missing") {
      clearPendingLogin();
      setAwaitingApproval(null);
      setLoginDenied(false);
      setMustAuthenticate(false);
      try { onClose?.(); } catch { /* ignore */ }
    }
  }, [loginApprovalStatus, awaitingApproval, loginDenied, finalizePendingLogin, onClose]);

  if (showRegister) {
    return <RegisterModal onClose={handleRegisterSuccess} />;
  }

  // ════════════════════════════════════════════════════════════════════
  //  WAITING / DENIED — popup modal only on the device trying to log in
  // ════════════════════════════════════════════════════════════════════
  if (awaitingApproval && !loginDenied) {
    return (
      <WaitingApprovalModal
        expiresAt={awaitingApproval.expiresAt || loginApprovalStatus?.expiresAt}
        onTimeout={async () => {
          try {
            if (awaitingApproval.userId && awaitingApproval.sessionId) {
              await cancelPendingLogin({
                userId: String(awaitingApproval.userId),
                sessionId: String(awaitingApproval.sessionId),
              });
            }
          } catch { /* ignore */ }
          clearPendingLogin();
          setDenyReason("timeout");
          setLoginDenied(true);
        }}
        onClose={async () => {
          try {
            if (awaitingApproval.userId && awaitingApproval.sessionId) {
              await cancelPendingLogin({
                userId: String(awaitingApproval.userId),
                sessionId: String(awaitingApproval.sessionId),
              });
            }
          } catch { /* ignore */ }
          clearPendingLogin();
          setAwaitingApproval(null);
          setLoginDenied(false);
          setDenyReason(null);
          setMustAuthenticate(false);
          setPinValue("");
          setPinLoading(false);
          setView("login");
          try { onClose?.(); } catch { /* ignore */ }
        }}
      />
    );
  }

  if (loginDenied) {
    return (
      <LoginDeniedModal
        reason={denyReason}
        onClose={() => {
          setLoginDenied(false);
          setDenyReason(null);
          setAwaitingApproval(null);
          clearPendingLogin();
          setMustAuthenticate(false);
          setDeviceUnlockMode(false);
          setPendingUser(null);
          setPinValue("");
          setView("login");
          try { onClose?.(); } catch { /* ignore */ }
        }}
      />
    );
  }

  // ════════════════════════════════════════════════════════════════════
  //  USE ANOTHER ACCOUNT — same pink full-screen as PIN (not the white modal)
  // ════════════════════════════════════════════════════════════════════
  if (switchAccountMode && view === "login") {
    return createPortal(
      <div
        className="pin-unlock-screen pin-switch-login"
        role="dialog"
        aria-modal="true"
        aria-label="Log in"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="pin-switch-back" onClick={backToPinFromSwitch}>
          <i className="fas fa-arrow-left" aria-hidden="true" /> Back
        </button>
        <div className="pin-unlock-top">
          <div className="pin-unlock-brand">
            <img src="/images/dklogo2-removebg-preview.png" alt="" className="pin-unlock-logo" />
            <span>DKMERCH</span>
          </div>
          <h2 className="pin-unlock-title pin-switch-welcome">Welcome</h2>
          <p className="pin-unlock-hint">Log in with another account</p>
        </div>

        <form className="pin-switch-form" onSubmit={handleSubmit}>
          {isLockedOut && (
            <div className="pin-switch-banner">
              Too many failed attempts. Try again in <strong>{formatCooldown(loginCooldown)}</strong>
            </div>
          )}
          {error && !isLockedOut && (
            <div className={`pin-switch-banner${error.startsWith("✅") ? " ok" : ""}`}>
              {error.startsWith("✅") ? error.replace("✅ ", "") : error}
            </div>
          )}

          <label className="pin-switch-label" htmlFor="switch-email">Email / Username</label>
          <input
            id="switch-email"
            name="email"
            type="text"
            className="pin-switch-input"
            placeholder="Email or username"
            value={formData.email}
            onChange={handleChange}
            required
            autoComplete="username"
            disabled={isLockedOut || isLoading}
          />

          <label className="pin-switch-label" htmlFor="switch-password">Password</label>
          <div className="pin-switch-password-wrap">
            <input
              id="switch-password"
              name="password"
              type={showPassword ? "text" : "password"}
              className="pin-switch-input"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              required
              autoComplete="current-password"
              disabled={isLockedOut || isLoading}
            />
            <button
              type="button"
              className="pin-switch-eye"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <PwToggleIcon show={showPassword} />
            </button>
          </div>

          <button
            type="submit"
            className="pin-switch-submit"
            disabled={isLoading || isLockedOut}
          >
            {isLockedOut ? `Locked — ${formatCooldown(loginCooldown)}` : isLoading ? "Logging in…" : "Log In"}
          </button>

          <button
            type="button"
            className="pin-switch-link"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSwitchAccountMode(false);
              openResetPassword(e);
            }}
          >
            Reset PIN
          </button>
        </form>
      </div>,
      portalRoot()
    );
  }

  // ════════════════════════════════════════════════════════════════════
  //  RESET PIN — Gmail → email code → new PIN → confirm PIN
  // ════════════════════════════════════════════════════════════════════
  if (resetPasswordMode) {
    const resetDots = 6;
    const activePin = resetPinStep === 3 ? pinConfirmValue : pinValue;
    return createPortal(
      <div
        className={`pin-unlock-screen${resetPinStep >= 2 ? "" : " pin-switch-login"}`}
        role="dialog"
        aria-modal="true"
        aria-label="Reset PIN"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="pin-switch-back" onClick={backFromResetPassword}>
          <i className="fas fa-arrow-left" aria-hidden="true" /> Back
        </button>
        <div className="pin-unlock-top">
          <div className="pin-unlock-brand">
            <img src="/images/dklogo2-removebg-preview.png" alt="" className="pin-unlock-logo" />
            <span>DKMERCH</span>
          </div>
          <h2 className="pin-unlock-title pin-switch-welcome">
            {resetPinStep === 0 && "Reset PIN"}
            {resetPinStep === 1 && "Enter code"}
            {resetPinStep === 2 && "Enter new PIN"}
            {resetPinStep === 3 && "Re-type new PIN"}
          </h2>
          <p className="pin-unlock-hint">
            {resetPinStep === 0 && "Enter the Gmail used on this account"}
            {resetPinStep === 1 && "We sent a 6-digit code to your Gmail"}
            {resetPinStep === 2 && "Choose a new 6-digit PIN"}
            {resetPinStep === 3 && "Enter the same PIN again to confirm"}
          </p>
        </div>

        {resetPinStep < 2 ? (
          <div className="pin-switch-form" style={{ width: "100%", maxWidth: 420 }}>
            {codeMsg && (
              <div className={`pin-switch-banner${codeMsg.startsWith("✅") ? " ok" : ""}`}>
                {codeMsg.replace(/^✅\s*|^❌\s*/, "")}
              </div>
            )}
            {resetMsg && (
              <div className={`pin-switch-banner${resetMsg.startsWith("✅") ? " ok" : ""}`}>
                {resetMsg.replace(/^✅\s*|^❌\s*/, "")}
              </div>
            )}

            {resetPinStep === 0 && (
              <>
                <label className="pin-switch-label" htmlFor="reset-gmail">Gmail</label>
                <input
                  id="reset-gmail"
                  type="email"
                  className="pin-switch-input"
                  placeholder="you@gmail.com"
                  value={forgotEmail}
                  onChange={(e) => { setForgotEmail(e.target.value); setCodeMsg(""); }}
                  autoComplete="email"
                  disabled={sendingCode}
                />
                <button
                  type="button"
                  className="pin-switch-submit"
                  onClick={handleSendPinResetCode}
                  disabled={sendingCode || passwordCooldown > 0}
                >
                  {sendingCode ? "Sending…" : passwordCooldown > 0 ? `Resend in ${passwordCooldown}s` : "Send code"}
                </button>
              </>
            )}

            {resetPinStep === 1 && (
              <>
                <label className="pin-switch-label" htmlFor="reset-pin-code">Verification code</label>
                <div className="pin-switch-code-row">
                  <input
                    id="reset-pin-code"
                    type="text"
                    inputMode="numeric"
                    className="pin-switch-input"
                    placeholder="6-digit code"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    maxLength={6}
                    disabled={resetLoading}
                  />
                  <button
                    type="button"
                    className="pin-switch-code-btn"
                    onClick={handleSendPinResetCode}
                    disabled={sendingCode || passwordCooldown > 0 || resetLoading}
                  >
                    {sendingCode ? "…" : passwordCooldown > 0 ? `${passwordCooldown}s` : "Resend"}
                  </button>
                </div>
                <button
                  type="button"
                  className="pin-switch-submit"
                  onClick={handleVerifyPinResetCode}
                  disabled={resetLoading || verificationCode.length !== 6}
                >
                  {resetLoading ? "Checking…" : "Verify code"}
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="pin-unlock-mid">
              <div className="pin-unlock-dots" aria-hidden="true">
                {Array.from({ length: resetDots }).map((_, i) => (
                  <span
                    key={i}
                    className={`pin-unlock-dot${i < activePin.length ? " filled" : ""}`}
                  />
                ))}
              </div>
              {pinError && <div className="pin-unlock-error">{pinError}</div>}
              {resetMsg && !pinError && (
                <div className="pin-unlock-loading">{resetMsg.replace(/^✅\s*/, "")}</div>
              )}
              {resetLoading && <div className="pin-unlock-loading">Saving…</div>}
            </div>
            <div className="pin-unlock-pad">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="pin-unlock-key"
                  disabled={resetLoading || activePin.length >= resetDots}
                  onClick={() => appendResetPinDigit(String(n))}
                >
                  {n}
                </button>
              ))}
              <span className="pin-unlock-key pin-unlock-key--spacer" aria-hidden="true" />
              <button
                type="button"
                className="pin-unlock-key"
                disabled={resetLoading || activePin.length >= resetDots}
                onClick={() => appendResetPinDigit("0")}
              >
                0
              </button>
              <button
                type="button"
                className="pin-unlock-key pin-unlock-key--ghost"
                disabled={resetLoading || !activePin}
                onClick={backspaceResetPin}
                aria-label="Delete"
              >
                ⌫
              </button>
            </div>
            <div className="pin-unlock-footer" style={{ justifyContent: "center" }}>
              <button
                type="button"
                className="pin-switch-submit"
                style={{ width: "100%", maxWidth: 320 }}
                disabled={resetLoading || activePin.length !== 6}
                onClick={handleSaveResetPin}
              >
                {resetPinStep === 2 ? "Continue" : resetLoading ? "Saving…" : "Save new PIN"}
              </button>
            </div>
          </>
        )}
      </div>,
      portalRoot()
    );
  }

  // ════════════════════════════════════════════════════════════════════
  //  DEVICE UNLOCK — full-screen pink PIN (GCash-style), only after app close
  // ════════════════════════════════════════════════════════════════════
  if (view === "pin" && deviceUnlockMode) {
    const initials = String(pendingUser?.name || pendingUser?.email || "U")
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";
    const dots = pinDigitCount;
    return createPortal(
      <div
        className="pin-unlock-screen"
        role="dialog"
        aria-modal="true"
        aria-label="Enter PIN"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pin-unlock-top">
          <div className="pin-unlock-brand">
            <img src="/images/dklogo2-removebg-preview.png" alt="" className="pin-unlock-logo" />
            <span>DKMERCH</span>
          </div>
          <div className="pin-unlock-avatar" aria-hidden="true">{initials}</div>
          <div className="pin-unlock-name">{pendingUser?.name || "Welcome back"}</div>
          <div className="pin-unlock-email">{pendingUser?.email || ""}</div>
        </div>

        <div className="pin-unlock-mid">
          <h2 className="pin-unlock-title">
            {pinCooldown > 0 ? "PIN temporarily locked" : "Enter your PIN"}
          </h2>
          <p className="pin-unlock-hint">
            <i className="fas fa-info-circle" aria-hidden="true" />
            {pinCooldown > 0
              ? `Wait ${formatCooldown(pinCooldown)} before trying again.`
              : "Never share your PIN with anyone."}
          </p>
          <div className="pin-unlock-dots" aria-hidden="true">
            {Array.from({ length: dots }).map((_, i) => (
              <span key={i} className={`pin-unlock-dot${i < pinValue.length ? " filled" : ""}`} />
            ))}
          </div>
          {pinError && <div className="pin-unlock-error">{pinError}</div>}
          {!pinError && pinCooldown <= 0 && pinFailsLeft < PIN_FAIL_LIMIT && (
            <div className="pin-unlock-loading">
              {pinFailsLeft} attempt{pinFailsLeft === 1 ? "" : "s"} left
            </div>
          )}
          {pinLoading && <div className="pin-unlock-loading">Checking…</div>}
        </div>

        <div className="pin-unlock-pad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button
              key={n}
              type="button"
              className="pin-unlock-key"
              disabled={pinCooldown > 0 || pinLoading || pinValue.length >= dots}
              onClick={() => appendPinDigit(String(n))}
            >
              {n}
            </button>
          ))}
          <span className="pin-unlock-key pin-unlock-key--spacer" aria-hidden="true" />
          <button
            type="button"
            className="pin-unlock-key"
            disabled={pinCooldown > 0 || pinLoading || pinValue.length >= dots}
            onClick={() => appendPinDigit("0")}
          >
            0
          </button>
          <button
            type="button"
            className="pin-unlock-key pin-unlock-key--ghost"
            disabled={pinCooldown > 0 || pinLoading || !pinValue}
            onClick={backspacePin}
            aria-label="Delete"
          >
            ⌫
          </button>
        </div>

        <div className="pin-unlock-footer">
          <button
            type="button"
            className="pin-unlock-forgot"
            onClick={openResetPassword}
            disabled={pinLoading}
          >
            Reset PIN
          </button>
          <button
            type="button"
            className="pin-unlock-switch"
            disabled={pinLoading}
            onClick={switchToAnotherAccount}
          >
            Use another account
          </button>
        </div>
      </div>,
      portalRoot()
    );
  }

  // ════════════════════════════════════════════════════════════════════
  //  RENDER — portal above #root so scroll-lock freeze never shifts login
  // ════════════════════════════════════════════════════════════════════
  return createPortal(
    <div
      className={`modal-overlay login-modal-overlay${mustAuthenticate ? " login-modal-overlay--locked" : ""}`}
      onClick={requestClose}
      role="presentation"
    >
      <div className="login-modal-content" onClick={(e) => e.stopPropagation()}>
        {!mustAuthenticate && (
          <button className="modal-close-btn" onClick={requestClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* ── REACTIVATION VIEW ─────────────────────────────────────── */}
        {view === "reactivate" && (
          <>
            <div className="login-modal-header">
              <h2 style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                {reactivateKind === "deleted" ? "Recover Account" : "Reactivate Account"}
              </h2>
              <p className="login-subtitle">
                {reactivateStep === 0
                  ? (reactivateKind === "deleted"
                    ? "Your account was deleted — recover within 30 days"
                    : "Your account is deactivated")
                  : `Verification code sent to ${reactivateEmail}`}
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
                      {reactivateKind === "deleted" ? (
                        <>
                          This account is scheduled for permanent deletion.
                          {recoverUntil ? (
                            <> You can recover it until <strong>{new Date(recoverUntil).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" })}</strong>.</>
                          ) : (
                            <> You can recover it within <strong>30 days</strong> of deletion.</>
                          )}
                          {" "}We’ll send a 6-digit code to <strong>{reactivateEmail}</strong>.
                        </>
                      ) : (
                        <>
                          Are you sure you want to reactivate this account? We'll send a 6-digit verification code to <strong>{reactivateEmail}</strong> to confirm your identity.
                        </>
                      )}
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
                    {reactivateKind === "deleted" ? "Yes, Recover My Account" : "Yes, Reactivate My Account"}
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
                      <><svg className="spinner" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>{reactivateKind === "deleted" ? "Recovering..." : "Reactivating..."}</>
                    ) : (
                      <><svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 20, height: 20 }}><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>{reactivateKind === "deleted" ? "Recover My Account" : "Reactivate My Account"}</>
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
              <h2 style={{ background: accentGradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                {deviceUnlockMode ? "Welcome Back" : "Enter Your PIN to Continue"}
              </h2>
              <p className="login-subtitle">
                {deviceUnlockMode
                  ? `Hi ${pendingUser?.name || "there"} — enter your PIN to unlock.`
                  : accountHasPin
                    ? pendingUser?.role === "admin"
                      ? `Hi ${pendingUser?.name || "Admin"} — enter your PIN to open the admin panel.`
                      : `Hi ${pendingUser?.name || "there"} — enter your PIN to start shopping.`
                    : `Hi ${pendingUser?.name || "there"} — tap Forgot PIN to create your PIN.`}
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
                {pinLoading
                  ? "Checking…"
                  : deviceUnlockMode
                    ? "Unlock"
                    : pendingUser?.role === "admin"
                      ? "Continue to Admin"
                      : "Continue to Shop"}
              </button>
              <div className="signup-section" style={{ marginTop: 0 }}>
                <p>
                  <button type="button" className="signup-link" style={{ color: accentColor }} onClick={openResetPassword}>
                    Reset Password
                  </button>
                </p>
                <p>
                  <button
                    type="button"
                    className="signup-link"
                    style={{ color: "#9ca3af" }}
                    onClick={() => {
                      if (deviceUnlockMode || mustAuthenticate) {
                        switchToAnotherAccount();
                        return;
                      }
                      setDeviceUnlockMode(false);
                      setAccountHasPin(false);
                      setPendingUser(null);
                      setPinValue("");
                      setPinError("");
                      setView("login");
                    }}
                  >
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
              <h2 style={{ background: accentGradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                {pinStep === 0 ? (isPinReset ? "Set New PIN" : "Create Your PIN") : "Confirm Your PIN"}
              </h2>
              <p className="login-subtitle">
                {pinStep === 0
                  ? (isPinReset
                    ? "Choose a new 6-digit PIN for faster unlock on this device."
                    : "This account doesn’t have a PIN yet — create a 6-digit PIN to continue.")
                  : "Re-enter the same 6-digit PIN to confirm"}
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
                    maxLength={6}
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
                disabled={pinLoading || (pinStep === 0 ? pinValue.length !== 6 : pinConfirmValue.length !== 6)}
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

        {/* ── QUICK SIGN IN (desktop QR only; mobile uses code in Settings) ── */}
        {view === "quickSignIn" && (
          <>
            <div className="login-modal-header">
              <h2 style={{ background: accentGradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                Quick Sign In
              </h2>
              <p className="login-subtitle">
                {qsiDesktopHost
                  ? "Scan this QR with your phone (Settings → Quick Sign In) while logged in on mobile — or type the code there."
                  : "QR is only for desktop. On phone, open Settings → Quick Sign In and enter the code shown on your computer."}
              </p>
            </div>
            <div className="login-form qsi-panel">
              {!qsiDesktopHost ? (
                <div className="qsi-mobile-only">
                  <p className="qsi-hint" style={{ marginBottom: 12 }}>
                    Use this phone only to <strong>approve</strong> a desktop login:
                  </p>
                  <ol className="qsi-mobile-steps">
                    <li>On your <strong>computer</strong>, open Login → Quick Sign In (QR + code appear there).</li>
                    <li>Stay logged in on this phone → <strong>Settings → Quick Sign In</strong>.</li>
                    <li>Scan the desktop QR, or type the <strong>ABCD-EFGH</strong> code.</li>
                  </ol>
                  <button
                    type="button"
                    className="login-submit-btn"
                    style={{ background: accentGradient, marginTop: 8 }}
                    onClick={() => {
                      onClose?.();
                      navigate("/settings");
                    }}
                  >
                    Open Settings
                  </button>
                </div>
              ) : (
                <>
                  {qsiCreating && (
                    <div className="qsi-status"><i className="fas fa-spinner fa-spin"></i> Generating QR…</div>
                  )}
                  {qsiError && (
                    <div className="error-banner"><span>{qsiError}</span></div>
                  )}
                  {!qsiCreating && qsiToken && (
                    <>
                      <div className="qsi-qr-wrap">
                        <QRCodeSVG
                          value={`${PRODUCTION_SITE_URL.replace(/\/$/, "")}/?qsi=${encodeURIComponent(qsiToken)}`}
                          size={200}
                          level="M"
                          includeMargin
                        />
                      </div>
                      <p className="qsi-code-label">Or enter this code on mobile Settings</p>
                      <code className="qsi-code">{formatQuickSignInCode(qsiToken)}</code>
                      <p className="qsi-hint">
                        {qsiDone || quickSignInSession?.status === "approved"
                          ? "Approved — signing you in…"
                          : quickSignInSession?.status === "expired" || (qsiExpiresAt && Date.now() > qsiExpiresAt)
                            ? "Expired — generate a new one."
                            : "Waiting for mobile scan / code…"}
                      </p>
                      {(quickSignInSession?.status === "expired" || (qsiExpiresAt && Date.now() > qsiExpiresAt)) && (
                        <button
                          type="button"
                          className="login-submit-btn"
                          style={{ background: accentGradient }}
                          onClick={() => setQsiNonce((n) => n + 1)}
                        >
                          Generate new QR
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
              <button type="button" className="signup-link" style={{ color: accentColor, marginTop: 12 }} onClick={() => setView("login")}>
                ← Back to password login
              </button>
            </div>
          </>
        )}

        {/* ── LOGIN VIEW ───────────────────────────────────────────── */}
        {view === "login" && (
          <>
            <div className="login-modal-header">
              <h2 style={{ background: accentGradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                Welcome
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

              <div className="forgot-password-wrapper forgot-password-wrapper--row">
                <button type="button" className="forgot-password-link" style={{ color: accentColor }} onClick={() => setView("quickSignIn")}>
                  <i className="fas fa-qrcode" aria-hidden="true" /> Quick Sign In
                </button>
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
                  <>Locked — {formatCooldown(loginCooldown)}</>
                ) : isLoading ? (
                  <><svg className="spinner" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Logging in...</>
                ) : (
                  <>Log In</>
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
    </div>,
    portalRoot()
  );
};

export default LoginModal;