// src/context/AuthContext.js
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { appendActivityLog } from "../admin/lib/localActivityLog";
import {
  saveDeviceUnlock,
  clearDeviceUnlock,
  getDeviceUnlock,
  markExplicitLogout,
  clearExplicitLogoutFlag,
} from "../lib/deviceUnlock";
import { readAuthGate, isAuthGateLocked, clearAuthGate } from "../lib/authGate";
import { collectLoginDeviceInfo } from "../utils/deviceInfo";
import NewLoginAlertModal from "../components/NewLoginAlertModal";
import { useNotification } from "./NotificationContext";

const AuthContext = createContext(null);
const AUTH_USER_KEY = "authUser";
const SESSION_ALIVE_KEY = "dkmerch_session_alive";
const LAST_ACTIVE_KEY = "dkmerch_last_active";
/** New device waiting for "Yes, it's me" on the other device. */
const PENDING_LOGIN_KEY = "dkmerch_pending_login";

export function readPendingLogin() {
  try {
    return JSON.parse(sessionStorage.getItem(PENDING_LOGIN_KEY) || "null");
  } catch {
    return null;
  }
}

export function writePendingLogin(payload) {
  try {
    if (!payload) sessionStorage.removeItem(PENDING_LOGIN_KEY);
    else sessionStorage.setItem(PENDING_LOGIN_KEY, JSON.stringify(payload));
  } catch { /* ignore */ }
}

export function clearPendingLogin() {
  try { sessionStorage.removeItem(PENDING_LOGIN_KEY); } catch { /* ignore */ }
}
function readAuthUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_USER_KEY) || "null");
  } catch {
    return null;
  }
}

function writeAuthUser(user) {
  try {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  } catch { /* ignore */ }
}

function clearAuthUser() {
  try { localStorage.removeItem(AUTH_USER_KEY); } catch { /* ignore */ }
}

function markSessionAlive() {
  try { sessionStorage.setItem(SESSION_ALIVE_KEY, "1"); } catch { /* ignore */ }
  try { localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now())); } catch { /* ignore */ }
}

function clearSessionAlive() {
  try { sessionStorage.removeItem(SESSION_ALIVE_KEY); } catch { /* ignore */ }
}

function isSessionAlive() {
  try {
    return sessionStorage.getItem(SESSION_ALIVE_KEY) === "1";
  } catch {
    return false;
  }
}

function wasExplicitLogout() {
  try {
    return localStorage.getItem("dkmerch_explicit_logout") === "1";
  } catch {
    return false;
  }
}

/** PIN unlock after close is for installed app only — not regular Brave/Chrome tabs. */
function isStandalonePwa() {
  try {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true ||
      /source=pwa/i.test(window.location.search || "")
    );
  } catch {
    return false;
  }
}

export const AuthProvider = ({ children }) => {
  const { showNotification } = useNotification();
  const [user, setUser]                       = useState(null);
  const [role, setRole]                       = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isReady, setIsReady]                 = useState(false);
  // Cold start (app closed then opened): prompt PIN unlock, not full login
  const [needsDeviceUnlock, setNeedsDeviceUnlock] = useState(false);
  /** FB-style alert when another device signs into this account */
  const [securityAlert, setSecurityAlert] = useState(null);

  const loginUserMutation  = useMutation(api.users.loginUser);
  const seedAdminMutation  = useMutation(api.users.seedAdmin);
  const loginRiderMutation = useMutation(api.riders.loginRider);
  const createUserMutation = useMutation(api.users.createUser);
  const startUserSession   = useMutation(api.users.startUserSession);
  const touchUserSession   = useMutation(api.users.touchUserSession);
  const endUserSession     = useMutation(api.users.endUserSession);
  const confirmLoginAlert  = useMutation(api.users.confirmLoginAlert);
  const denyLoginAlert     = useMutation(api.users.denyLoginAlert);
  const touchRiderSession  = useMutation(api.riders.touchRiderSession);
  const endRiderSession    = useMutation(api.riders.endRiderSession);
  const confirmRiderLoginAlert = useMutation(api.riders.confirmRiderLoginAlert);
  const denyRiderLoginAlert    = useMutation(api.riders.denyRiderLoginAlert);
  const kickedRef = useRef(false);
  /** After Yes/No: keep confirmation UI open until OK */
  const holdLogoutConfirmRef = useRef(false);
  const userRef = useRef(null);
  userRef.current = user;

  const safeLog = (payload) => {
    try { appendActivityLog(payload); } catch {}
  };

  // Customer + admin — session still valid unless this device was removed
  const sessionCheck = useQuery(
    api.users.checkUserSession,
    isAuthenticated
      && user?._id
      && user?.sessionId
      && (user.role === "user" || user.role === "admin")
      ? { userId: String(user._id), sessionId: String(user.sessionId) }
      : "skip"
  );

  /**
   * Pending new-device login while THIS device is still signed in.
   * Query stays active during PIN; Yes/No UI waits until unlock (homepage).
   */
  const pendingLoginAlert = useQuery(
    api.users.getPendingLoginAlert,
    isAuthenticated
      && user?._id
      && (user.role === "user" || user.role === "admin")
      ? { userId: String(user._id) }
      : "skip"
  );

  const pendingRiderLoginAlert = useQuery(
    api.riders.getPendingRiderLoginAlert,
    isAuthenticated && user?.role === "rider" && user?.email
      ? { email: String(user.email) }
      : "skip"
  );

  useEffect(() => {
    seedAdminMutation({}).catch(() => {});
  }, []);

  useEffect(() => {
    const storedUser = readAuthUser();
    const alive = isSessionAlive();
    const pwa = isStandalonePwa();
    const unlock = getDeviceUnlock(); // null after explicit logout
    const loggedOut = wasExplicitLogout();
    const gate = readAuthGate();
    const gateLocked = isAuthGateLocked(gate);

    const restoreSession = (withPinGate = false) => {
      // Don't mark session alive yet when PIN is required — otherwise a soft
      // reopen would skip the pink PIN gate on the next cold start.
      if (!withPinGate) markSessionAlive();
      setUser(storedUser);
      setRole(storedUser.role);
      setIsAuthenticated(true); // keep route/page under the PIN overlay
      setNeedsDeviceUnlock(withPinGate);
    };

    // Use another account — soft-logged-out; keep unlock profile, never wipe on refresh
    if (gate === "switch") {
      if (loggedOut) {
        // Explicit logout elsewhere wins
        clearAuthUser();
        clearDeviceUnlock();
        setUser(null);
        setRole(null);
        setIsAuthenticated(false);
        setNeedsDeviceUnlock(false);
        setIsReady(true);
        return;
      }
      clearAuthUser();
      setUser(null);
      setRole(null);
      setIsAuthenticated(false);
      setNeedsDeviceUnlock(false);
      setIsReady(true);
      return;
    }

    // Only show PIN/reset UI again if THAT gate was open when they refreshed
    if ((gate === "reset" || gate === "pin") && storedUser && !loggedOut) {
      restoreSession(true);
      setIsReady(true);
      return;
    }

    if (!storedUser || loggedOut) {
      if (loggedOut) {
        clearAuthUser();
        clearDeviceUnlock();
      }
      setUser(null);
      setRole(null);
      setIsAuthenticated(false);
      setNeedsDeviceUnlock(false);
      setIsReady(true);
      return;
    }

    const canPinUnlock =
      !storedUser.role
      || storedUser.role === "user"
      || storedUser.role === "admin";
    const hasUnlock =
      canPinUnlock
      && unlock?._id
      && String(unlock._id) === String(storedUser._id);

    // Already unlocked in this browser session (incl. hard refresh on dashboard/home/rider)
    // → stay on the same page; do NOT force PIN again
    if (alive && !gateLocked) {
      restoreSession(false);
      setIsReady(true);
      return;
    }

    // True cold start (app killed / new session) with unlock profile → PIN once
    // Hard refresh keeps sessionStorage alive, so it won't hit this after unlock.
    if (!alive && hasUnlock && !gateLocked) {
      restoreSession(true);
      setIsReady(true);
      return;
    }

    // Browser tab with stored auth but no unlock profile → stay logged in
    if (!pwa && !gateLocked) {
      restoreSession(false);
      setIsReady(true);
      return;
    }

    // PWA cold start without unlock profile → require full login
    if (!gateLocked) {
      clearAuthUser();
      clearDeviceUnlock();
    } else {
      clearAuthUser();
    }
    setUser(null);
    setRole(null);
    setIsAuthenticated(false);
    setNeedsDeviceUnlock(false);
    setIsReady(true);
  }, []);

  // Keep last-active + server heartbeat while this account is signed in.
  // Also run during PIN gate so another-device login still triggers Yes/No.
  // Rebind sessionId if local auth lost it — otherwise server skips the notice.
  useEffect(() => {
    if (!isAuthenticated) return;
    const touchLocal = () => {
      try { localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now())); } catch { /* ignore */ }
      // Don't mark session alive while PIN gate is up (cold start still needs PIN)
      if (!needsDeviceUnlock) markSessionAlive();
    };
    const applySessionId = (nextId) => {
      const sid = String(nextId || "").trim();
      if (!sid) return;
      const u = userRef.current;
      if (!u || String(u.sessionId || "") === sid) return;
      const next = { ...u, sessionId: sid };
      userRef.current = next;
      writeAuthUser(next);
      setUser(next);
      if (next.role === "user" || next.role === "admin") {
        try { saveDeviceUnlock(next); } catch { /* ignore */ }
      }
    };
    const touchServer = () => {
      const u = userRef.current;
      if (u.role === "rider" && u.email) {
        touchRiderSession({
          email: String(u.email),
          sessionId: u.sessionId ? String(u.sessionId) : undefined,
        })
          .then((res) => {
            if (res?.success && res.sessionId) applySessionId(res.sessionId);
          })
          .catch(() => {});
        return;
      }
      if (!u?._id) return;
      if (u.role !== "user" && u.role !== "admin") return;
      touchUserSession({
        userId: String(u._id),
        sessionId: u.sessionId ? String(u.sessionId) : undefined,
      })
        .then((res) => {
          if (res?.success && res.sessionId) applySessionId(res.sessionId);
        })
        .catch(() => {});
    };
    const touch = () => {
      touchLocal();
      touchServer();
    };
    touch();
    const onVis = () => { if (!document.hidden) touch(); };
    window.addEventListener("focus", touch);
    document.addEventListener("visibilitychange", onVis);
    const id = window.setInterval(touch, 45_000);
    return () => {
      window.removeEventListener("focus", touch);
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
    };
  }, [isAuthenticated, needsDeviceUnlock, touchUserSession, touchRiderSession]);

  const applySession = (sessionUser) => {
    kickedRef.current = false;
    clearExplicitLogoutFlag();
    try { clearAuthGate(); } catch { /* ignore */ }
    writeAuthUser(sessionUser);
    markSessionAlive();
    if (sessionUser.role === "user" || sessionUser.role === "admin") {
      saveDeviceUnlock(sessionUser);
    }
    setUser(sessionUser);
    setRole(sessionUser.role);
    setIsAuthenticated(true);
    setNeedsDeviceUnlock(false);
  };

  const finishSecurityLogout = () => {
    holdLogoutConfirmRef.current = false;
    clearAuthUser();
    clearSessionAlive();
    clearPendingLogin();
    try { localStorage.removeItem(LAST_ACTIVE_KEY); } catch { /* ignore */ }
    markExplicitLogout();
    clearDeviceUnlock();
    try { sessionStorage.removeItem("dkmerch_push_asked"); } catch { /* ignore */ }
    setUser(null);
    setRole(null);
    setIsAuthenticated(false);
    setNeedsDeviceUnlock(false);
    setSecurityAlert(null);
    kickedRef.current = false;
    try {
      if (
        window.location.pathname.startsWith("/admin")
        || window.location.pathname.startsWith("/settings")
        || window.location.pathname.startsWith("/rider")
      ) {
        window.location.assign("/");
      }
    } catch { /* ignore */ }
  };

  const clearLoginAlertDeepLink = () => {
    try {
      sessionStorage.removeItem("dkmerch_open_login_alert");
      const u = new URL(window.location.href);
      if (u.searchParams.get("open") === "loginAlert") {
        u.searchParams.delete("open");
        const qs = u.searchParams.toString();
        window.history.replaceState(
          null,
          "",
          `${u.pathname}${qs ? `?${qs}` : ""}${u.hash || ""}`
        );
      }
    } catch { /* ignore */ }
  };

  // Show FB-style alert after PIN unlock only — never interrupt the PIN page
  useEffect(() => {
    const current = userRef.current;
    const customerLoading =
      isAuthenticated
      && current?._id
      && (current.role === "user" || current.role === "admin")
      && pendingLoginAlert === undefined;
    const riderLoading =
      isAuthenticated
      && current?.role === "rider"
      && pendingRiderLoginAlert === undefined;
    // Query still loading — don't clear / skip the notice
    if (customerLoading || riderLoading) return;

    const pending = pendingLoginAlert || pendingRiderLoginAlert || null;
    if (!pending) {
      // Don't wipe a held confirmation; only clear live pending UI
      setSecurityAlert((prev) => (prev?.mode === "pending" ? null : prev));
      return;
    }
    if (holdLogoutConfirmRef.current) return;
    // Show above PIN too (modal z-index is higher) so the notice never "disappears"
    if (!current) return;
    try { clearAuthGate(); } catch { /* ignore */ }
    setSecurityAlert((prev) => {
      const same =
        prev?.mode === "pending"
        && String(prev?.alert?.sessionId || "") === String(pending.sessionId || "");
      if (!same) {
        try {
          showNotification(
            `New login request from ${pending.deviceName || "another device"}. Confirm if this was you.`,
            "warning",
            { duration: 8000, dedupeKey: "login-alert-pending" }
          );
        } catch { /* ignore */ }
      }
      return {
        alert: pending,
        previousUser: current,
        mode: "pending",
      };
    });
    clearLoginAlertDeepLink();
  }, [pendingLoginAlert, pendingRiderLoginAlert, isAuthenticated, showNotification]);

  // Push tap — open Yes/No as soon as pending alert is available (even over PIN)
  useEffect(() => {
    const bump = () => {
      try { sessionStorage.setItem("dkmerch_open_login_alert", "1"); } catch { /* ignore */ }
      const current = userRef.current;
      const pending = pendingLoginAlert || pendingRiderLoginAlert;
      if (!current || !pending) return;
      if (holdLogoutConfirmRef.current) return;
      try { clearAuthGate(); } catch { /* ignore */ }
      setSecurityAlert({
        alert: pending,
        previousUser: current,
        mode: "pending",
      });
      clearLoginAlertDeepLink();
    };
    window.addEventListener("dkOpenLoginAlert", bump);
    try {
      if (sessionStorage.getItem("dkmerch_open_login_alert") === "1") bump();
    } catch { /* ignore */ }
    return () => window.removeEventListener("dkOpenLoginAlert", bump);
  }, [pendingLoginAlert, pendingRiderLoginAlert]);

  // Only sign out if THIS session was removed (true takeover) — never during Yes/No
  useEffect(() => {
    if (!sessionCheck || sessionCheck.valid !== false) return;
    if (sessionCheck.reason !== "new_device_logged_in") return;
    if (holdLogoutConfirmRef.current) return;
    // Keep owner signed in while approving / blocking the other device
    if (securityAlert?.mode === "pending" || securityAlert?.mode === "approved") return;
    if (pendingLoginAlert || pendingRiderLoginAlert) return;
    if (kickedRef.current) return;
    kickedRef.current = true;
    finishSecurityLogout();
  }, [sessionCheck, securityAlert, pendingLoginAlert, pendingRiderLoginAlert]);

  const handleSecurityYes = async (opts = {}) => {
    // Second step: dismiss confirmation — stay signed in on this device
    if (opts?.finishLogout || opts?.dismiss) {
      holdLogoutConfirmRef.current = false;
      kickedRef.current = false;
      setSecurityAlert(null);
      return;
    }

    const alert = securityAlert?.alert;
    const prev = securityAlert?.previousUser;
    if (!alert?.sessionId || !prev) {
      throw new Error("Missing login request. Please try again.");
    }

    let result;
    if (prev.role === "rider") {
      if (!prev.email) throw new Error("Missing login request. Please try again.");
      result = await confirmRiderLoginAlert({
        email: String(prev.email),
        sessionId: String(alert.sessionId),
        keepSessionId: prev.sessionId ? String(prev.sessionId) : undefined,
      });
    } else {
      if (!prev._id) throw new Error("Missing login request. Please try again.");
      result = await confirmLoginAlert({
        userId: String(prev._id),
        sessionId: String(alert.sessionId),
        keepSessionId: prev.sessionId ? String(prev.sessionId) : undefined,
      });
    }
    if (!result?.success) {
      throw new Error(result?.message || "Could not approve this login.");
    }
    holdLogoutConfirmRef.current = true;
    kickedRef.current = false;
    setSecurityAlert((s) => (s ? { ...s, mode: "approved" } : s));
    const device = alert.deviceName || "the other device";
    showNotification(
      `Login approved on ${device}. You’re still signed in here — both devices can use the account.`,
      "success",
      { duration: 5000, dedupeKey: "login-alert-yes" }
    );
  };

  const handleSecurityNo = async (opts = {}) => {
    // Second step: dismiss confirmation
    if (opts?.dismiss) {
      kickedRef.current = false;
      holdLogoutConfirmRef.current = false;
      setSecurityAlert(null);
      return;
    }

    const alert = securityAlert?.alert;
    const prev = securityAlert?.previousUser;
    if (!alert?.sessionId || !prev) {
      throw new Error("Missing login request. Please try again.");
    }

    let result;
    if (prev.role === "rider") {
      if (!prev.email) throw new Error("Missing login request. Please try again.");
      result = await denyRiderLoginAlert({
        email: String(prev.email),
        newSessionId: String(alert.sessionId),
      });
    } else {
      if (!prev._id) throw new Error("Missing login request. Please try again.");
      result = await denyLoginAlert({
        userId: String(prev._id),
        previousSessionId: prev.sessionId ? String(prev.sessionId) : undefined,
        newSessionId: String(alert.sessionId),
      });
    }
    if (!result?.success) {
      throw new Error(result?.message || "Could not block this login.");
    }
    setSecurityAlert((s) => (s ? { ...s, mode: "denied" } : s));
    showNotification(
      "Login blocked. You’re still signed in on this device.",
      "success",
      { duration: 5000, dedupeKey: "login-alert-no" }
    );
  };

  const login = async (identifier, password, mode) => {
    try {
      // ══════════════════════════════════════════
      // RIDER LOGIN
      // ══════════════════════════════════════════
      if (mode === "rider") {
        const device = await collectLoginDeviceInfo({ fast: true });
        const riderResult = await loginRiderMutation({
          email: identifier,
          password,
          deviceName: device.deviceName,
          location: device.location,
          platform: device.platform,
        });

        if (!riderResult.riderExists) {
          return {
            success: false,
            message: "No rider account found with this email. Please register as a rider first.",
          };
        }

        if (!riderResult.success) {
          safeLog({
            action: "login_failed",
            actorEmail: identifier,
            actorRole: "rider",
            details: riderResult.message || "Rider login failed",
          });
          return { success: false, message: riderResult.message };
        }

        const sessionRider = {
          _id:       riderResult.rider._id,
          id:        riderResult.rider._id,
          name:      riderResult.rider.name,
          email:     riderResult.rider.email,
          role:      "rider",
          sessionId: riderResult.sessionId,
        };

        if (riderResult.pendingApproval && riderResult.sessionId) {
          const at = Date.now();
          const exp = Number(riderResult.expiresAt) || at + 60_000;
          writePendingLogin({
            userId: String(sessionRider._id),
            sessionId: String(riderResult.sessionId),
            user: sessionRider,
            at,
            expiresAt: exp,
            kind: "rider",
            email: String(sessionRider.email),
          });
          return {
            success: true,
            pendingApproval: true,
            sessionId: riderResult.sessionId,
            expiresAt: exp,
            role: "rider",
            user: sessionRider,
            pendingUser: sessionRider,
          };
        }

        applySession(sessionRider);
        safeLog({
          action: "login",
          actorEmail: sessionRider.email,
          actorName: sessionRider.name,
          actorRole: "rider",
          details: "Rider login success",
        });
        return { success: true, role: "rider" };
      }

      // ══════════════════════════════════════════
      // USER / ADMIN LOGIN
      // ══════════════════════════════════════════
      if (mode === "user" || !mode) {
        const result = await loginUserMutation({ identifier, password });

        // ── Password OK — may still need PIN / PIN setup ──
        if (result.success && result.user) {
          const sessionUser = {
            _id:      result.user._id,
            id:       result.user._id,
            name:     result.user.name,
            username: result.user.username,
            email:    result.user.email,
            phone:    result.user.phone || '',
            role:     result.user.role,
            ...(result.sessionId ? { sessionId: result.sessionId } : {}),
          };

          // Customer-chat (and other customer-only gates) must not accept staff accounts
          let customersOnly = false;
          try {
            customersOnly = sessionStorage.getItem("dk_login_customers_only") === "1";
          } catch { /* ignore */ }
          if (customersOnly && sessionUser.role !== "user") {
            return {
              success: false,
              message:
                sessionUser.role === "admin"
                  ? "Admin accounts cannot log in here. Open the admin panel instead."
                  : "This login is for customers only.",
            };
          }

          // Customer + admin: password OK → PIN entry OR first-time Create PIN
          if (sessionUser.role === "user" || sessionUser.role === "admin") {
            const needsPin = !!result.needsPin;
            const needsPinSetup = !!result.needsPinSetup && !needsPin;
            return {
              success: true,
              needsPin: needsPin || !needsPinSetup,
              needsPinSetup,
              pendingUser: sessionUser,
              role: sessionUser.role,
              requirePin: true,
            };
          }
        }

        // ── Self-deactivated / soft-deleted (within 30 days) → reactivation UI ──
        if (result.deactivated) {
          return {
            success:   false,
            deactivated: true,
            userEmail: result.userEmail,
            userName:  result.userName,
            message:   result.message,
          };
        }
        if (result.deleted) {
          return {
            success: false,
            deleted: true,
            recoverable: !!result.recoverable,
            userEmail: result.userEmail,
            userName: result.userName,
            deletedAt: result.deletedAt,
            recoverUntil: result.recoverUntil,
            message: result.message,
          };
        }

        if (mode === "user") {
          safeLog({
            action: "login_failed",
            actorEmail: identifier,
            actorRole: "user",
            details: result.message || "Invalid credentials",
          });
          return {
            success: false,
            message: result.message || "Invalid email/username or password.",
          };
        }

        // Legacy fallback to rider
        const device = await collectLoginDeviceInfo({ fast: true });
        const riderResult = await loginRiderMutation({
          email: identifier,
          password,
          deviceName: device.deviceName,
          location: device.location,
          platform: device.platform,
        });

        if (riderResult.riderExists) {
          if (riderResult.success && riderResult.rider) {
            const sessionRider = {
              _id:       riderResult.rider._id,
              id:        riderResult.rider._id,
              name:      riderResult.rider.name,
              email:     riderResult.rider.email,
              role:      "rider",
              sessionId: riderResult.sessionId,
            };
            if (riderResult.pendingApproval && riderResult.sessionId) {
              const at = Date.now();
              const exp = Number(riderResult.expiresAt) || at + 60_000;
              writePendingLogin({
                userId: String(sessionRider._id),
                sessionId: String(riderResult.sessionId),
                user: sessionRider,
                at,
                expiresAt: exp,
                kind: "rider",
                email: String(sessionRider.email),
              });
              return {
                success: true,
                pendingApproval: true,
                sessionId: riderResult.sessionId,
                expiresAt: exp,
                role: "rider",
                user: sessionRider,
                pendingUser: sessionRider,
              };
            }
            applySession(sessionRider);
            safeLog({
              action: "login",
              actorEmail: sessionRider.email,
              actorName: sessionRider.name,
              actorRole: "rider",
              details: "Rider login success (fallback)",
            });
            return { success: true, role: "rider" };
          }
          return { success: false, message: riderResult.message };
        }

        return {
          success: false,
          message: result.message || "Invalid username/email or password.",
        };
      }

      return { success: false, message: "Unknown login mode." };

    } catch (err) {
      console.error("Login error:", err);
      return { success: false, message: "Login failed. Please try again." };
    }
  };

  const register = async ({ name, username, email, password }) => {
    try {
      const result = await createUserMutation({ name, username, email, password, role: "user" });
      if (result?.success) {
        safeLog({
          action: "register",
          actorEmail: email,
          actorName: name,
          actorRole: "user",
          details: `Account created (@${username})`,
        });
      }
      return result;
    } catch (err) {
      console.error("Register error:", err);
      return { success: false, message: "Registration failed. Please try again." };
    }
  };

  /**
   * Finish login after PIN verify / PIN create (customer accounts).
   * If another device is already active, returns pendingApproval — do NOT
   * treat the user as logged in until that device taps Yes.
   */
  const completeLogin = async (pendingUser, details = "Account login success") => {
    if (!pendingUser?._id) return { success: false };
    // PIN unlock profile may omit sessionId — reuse active auth session on this device
    const storedAuth = readAuthUser();
    const unlockSnap = (() => {
      try { return getDeviceUnlock(); } catch { return null; }
    })();
    const reuseSessionId = String(
      pendingUser.sessionId
      || storedAuth?.sessionId
      || unlockSnap?.sessionId
      || userRef.current?.sessionId
      || ""
    ).trim();
    let sessionId = reuseSessionId || pendingUser.sessionId;
    let pendingApproval = false;
    let expiresAt = null;
    try {
      // Fast device info — don't block PIN login on GPS / IP geolocation
      const device = await collectLoginDeviceInfo({ fast: true });
      const started = await startUserSession({
        userId: pendingUser._id,
        deviceName: device.deviceName,
        location: device.location,
        platform: device.platform,
        // PIN unlock / returning visit: reuse local session so we don't ask Yes/No of nobody
        currentSessionId: reuseSessionId || undefined,
      });
      if (started?.sessionId) sessionId = started.sessionId;
      pendingApproval = !!started?.pendingApproval;
      if (started?.expiresAt) expiresAt = Number(started.expiresAt);
    } catch (err) {
      console.warn("startUserSession failed:", err);
    }
    const sessionUser = {
      _id:      pendingUser._id,
      id:       pendingUser._id,
      name:     pendingUser.name,
      username: pendingUser.username,
      email:    pendingUser.email,
      phone:    pendingUser.phone || "",
      role:     pendingUser.role || "user",
      ...(sessionId ? { sessionId } : {}),
    };

    if (pendingApproval && sessionId) {
      const at = Date.now();
      const exp = expiresAt || at + 60_000;
      writePendingLogin({
        userId: String(sessionUser._id),
        sessionId: String(sessionId),
        user: sessionUser,
        at,
        expiresAt: exp,
      });
      return {
        success: true,
        pendingApproval: true,
        sessionId,
        expiresAt: exp,
        role: sessionUser.role,
        user: sessionUser,
      };
    }

    clearPendingLogin();
    applySession(sessionUser);
    safeLog({
      action: "login",
      actorEmail: sessionUser.email,
      actorName: sessionUser.name,
      actorRole: sessionUser.role,
      details,
    });
    return { success: true, role: sessionUser.role, pendingApproval: false };
  };

  /** Activate session after the other device approved a pending login. */
  const finalizePendingLogin = (sessionUser, details = "Login approved on other device") => {
    if (!sessionUser?._id) return { success: false };
    clearPendingLogin();
    applySession(sessionUser);
    safeLog({
      action: "login",
      actorEmail: sessionUser.email,
      actorName: sessionUser.name,
      actorRole: sessionUser.role || "user",
      details,
    });
    return { success: true, role: sessionUser.role || "user" };
  };

  const updateUser = (updatedFields) => {
    setUser(prev => {
      const updated = { ...prev, ...updatedFields };
      writeAuthUser(updated);
      return updated;
    });
  };

  /**
   * @param {{ keepDeviceUnlock?: boolean }} [opts]
   * keepDeviceUnlock: "Use another account" — clear session but keep PIN profile for Back / reopen
   */
  const logout = (opts = {}) => {
    const keepUnlock = !!opts?.keepDeviceUnlock;
    const prev = user;
    if (prev) {
      safeLog({
        action: "logout",
        actorEmail: prev.email,
        actorName: prev.name,
        actorRole: prev.role || role || undefined,
        details: keepUnlock ? "Switch account (keep PIN unlock)" : "User logged out",
      });
      // Drop this device's server session (other devices stay signed in)
      if ((prev.role === "user" || prev.role === "admin") && prev._id) {
        endUserSession({
          userId: String(prev._id),
          sessionId: prev.sessionId ? String(prev.sessionId) : undefined,
        }).catch(() => {});
      }
      if (prev.role === "rider" && prev.email) {
        endRiderSession({
          email: String(prev.email),
          sessionId: prev.sessionId ? String(prev.sessionId) : undefined,
        }).catch(() => {});
      }
    }
    clearAuthUser();
    clearSessionAlive();
    clearPendingLogin();
    try { localStorage.removeItem(LAST_ACTIVE_KEY); } catch { /* ignore */ }
    if (keepUnlock) {
      // Stay on PIN chrome — do not mark explicit logout / wipe unlock profile
      setNeedsDeviceUnlock(false);
    } else {
      markExplicitLogout();
      clearDeviceUnlock();
      setNeedsDeviceUnlock(false);
    }
    try { sessionStorage.removeItem("dkmerch_push_asked"); } catch { /* ignore */ }
    setUser(null);
    setRole(null);
    setIsAuthenticated(false);
  };

  const clearDeviceUnlockPrompt = () => setNeedsDeviceUnlock(false);

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAuthenticated,
        isReady,
        needsDeviceUnlock,
        clearDeviceUnlockPrompt,
        login,
        completeLogin,
        finalizePendingLogin,
        register,
        logout,
        updateUser,
      }}
    >
      {children}
      {securityAlert && (
        <NewLoginAlertModal
          alert={securityAlert.alert}
          onConfirmYes={handleSecurityYes}
          onConfirmNo={handleSecurityNo}
        />
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  // Avoid crash if a consumer mounts outside AuthProvider during HMR
  return ctx || {
    user: null,
    role: null,
    isAuthenticated: false,
    isReady: false,
    needsDeviceUnlock: false,
    clearDeviceUnlockPrompt: () => {},
    login: async () => ({ success: false, message: "Auth not ready." }),
    completeLogin: () => ({ success: false }),
    finalizePendingLogin: () => ({ success: false }),
    register: async () => ({ success: false, message: "Auth not ready." }),
    logout: () => {},
    updateUser: () => {},
  };
};
