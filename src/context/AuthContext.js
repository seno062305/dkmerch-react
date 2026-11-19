// src/context/AuthContext.js
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { appendActivityLog } from "../admin/lib/localActivityLog";
import {
  saveDeviceUnlock,
  clearDeviceUnlock,
  clearRiderDeviceUnlock,
  getDeviceUnlock,
  getRiderDeviceUnlock,
  markExplicitLogout,
  markRiderExplicitLogout,
  clearExplicitLogoutFlag,
  clearRiderExplicitLogoutFlag,
} from "../lib/deviceUnlock";
import {
  parkRiderSession,
  getParkedRider,
  clearParkedRider,
  clearRiderBrowsingFlag,
  isRiderBrowsingShop,
} from "../lib/parkedRider";
import {
  parkCustomerSession,
  getParkedCustomer,
  clearParkedCustomer,
} from "../lib/parkedCustomer";
import { readAuthGate, isAuthGateLocked, clearAuthGate } from "../lib/authGate";
import { collectLoginDeviceInfo } from "../utils/deviceInfo";
import { consumeKeepSessionAfterUpdate } from "../utils/appUpdate";
import NewLoginAlertModal from "../components/NewLoginAlertModal";
import SessionIdleModal from "../components/SessionIdleModal";
import { useNotification } from "./NotificationContext";

const AuthContext = createContext(null);
const AUTH_USER_KEY = "authUser";
const SESSION_ALIVE_KEY = "dkmerch_session_alive";
const LAST_ACTIVE_KEY = "dkmerch_last_active";
/** Customer-only: last real UI activity (not server heartbeat). */
const CUSTOMER_IDLE_KEY = "dkmerch_customer_activity";
const CUSTOMER_IDLE_MS = 10 * 60 * 1000; // 10 minutes
const IDLE_NOTICE_KEY = "dkmerch_idle_logout_notice";
/** New device waiting for "Yes, it's me" on the other device. */
const PENDING_LOGIN_KEY = "dkmerch_pending_login";

function markIdleLogoutNotice() {
  try { sessionStorage.setItem(IDLE_NOTICE_KEY, "1"); } catch { /* ignore */ }
}

function consumeIdleLogoutNotice() {
  try {
    const on = sessionStorage.getItem(IDLE_NOTICE_KEY) === "1";
    if (on) sessionStorage.removeItem(IDLE_NOTICE_KEY);
    return on;
  } catch {
    return false;
  }
}

function readCustomerActivityAt() {
  try {
    const n = Number(localStorage.getItem(CUSTOMER_IDLE_KEY) || 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeCustomerActivityAt(ts = Date.now()) {
  try { localStorage.setItem(CUSTOMER_IDLE_KEY, String(ts)); } catch { /* ignore */ }
}

function clearCustomerActivityAt() {
  try { localStorage.removeItem(CUSTOMER_IDLE_KEY); } catch { /* ignore */ }
}

function isCustomerIdleExpired() {
  const last = readCustomerActivityAt();
  if (!last) return false;
  return Date.now() - last >= CUSTOMER_IDLE_MS;
}

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
  /** Popup after auto-logout from customer inactivity */
  const [idleSessionNotice, setIdleSessionNotice] = useState(() => consumeIdleLogoutNotice());
  const customerActivityRef = useRef(0);
  const logoutRef = useRef(null);

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
  const heartbeatChatPresence  = useMutation(api.supportChat.heartbeatPresence);
  const kickedRef = useRef(false);
  /** After Yes/No: keep confirmation UI open until OK */
  const holdLogoutConfirmRef = useRef(false);
  const userRef = useRef(null);
  userRef.current = user;

  const safeLog = (payload) => {
    try { appendActivityLog(payload); } catch {}
  };

  // Customer + admin — session still valid unless this device was removed
  const userSessionCheck = useQuery(
    api.users.checkUserSession,
    isAuthenticated
      && user?._id
      && user?.sessionId
      && (user.role === "user" || user.role === "admin")
      ? { userId: String(user._id), sessionId: String(user.sessionId) }
      : "skip"
  );

  // Rider — same kick/notice path when another device takes over
  const riderSessionCheck = useQuery(
    api.riders.checkRiderSession,
    isAuthenticated
      && user?.role === "rider"
      && user?.email
      && user?.sessionId
      ? { email: String(user.email), sessionId: String(user.sessionId) }
      : "skip"
  );

  const sessionCheck =
    user?.role === "rider" ? riderSessionCheck : userSessionCheck;

  /**
   * Pending new-device login while THIS device is still signed in.
   * Query stays active during PIN; Yes/No UI waits until unlock (homepage).
   */
  // Parked shop customer while in rider app — still receive Yes/No for that account
  const [parkedCustSnap, setParkedCustSnap] = useState(() => {
    try { return getParkedCustomer(); } catch { return null; }
  });
  // Parked rider while browsing shop — still receive Yes/No for that account
  const [parkedRiderSnap, setParkedRiderSnap] = useState(() => {
    try { return getParkedRider(); } catch { return null; }
  });
  useEffect(() => {
    const sync = () => {
      try { setParkedCustSnap(getParkedCustomer()); } catch { setParkedCustSnap(null); }
      try { setParkedRiderSnap(getParkedRider()); } catch { setParkedRiderSnap(null); }
    };
    sync();
    window.addEventListener("focus", sync);
    const id = window.setInterval(sync, 4000);
    return () => {
      window.removeEventListener("focus", sync);
      window.clearInterval(id);
    };
  }, [isAuthenticated, role]);

  const pendingLoginAlert = useQuery(
    api.users.getPendingLoginAlert,
    isAuthenticated
      && user?._id
      && (user.role === "user" || user.role === "admin")
      ? { userId: String(user._id) }
      : "skip"
  );

  const pendingParkedCustomerLoginAlert = useQuery(
    api.users.getPendingLoginAlert,
    isAuthenticated
      && user?.role === "rider"
      && parkedCustSnap?._id
      ? { userId: String(parkedCustSnap._id) }
      : "skip"
  );

  const loginBroadcast = useQuery(
    api.users.getLoginBroadcast,
    isAuthenticated
      && user?._id
      && (user.role === "user" || user.role === "admin")
      ? { userId: String(user._id) }
      : "skip"
  );

  const parkedCustomerLoginBroadcast = useQuery(
    api.users.getLoginBroadcast,
    isAuthenticated
      && user?.role === "rider"
      && parkedCustSnap?._id
      ? { userId: String(parkedCustSnap._id) }
      : "skip"
  );

  const pendingRiderLoginAlert = useQuery(
    api.riders.getPendingRiderLoginAlert,
    isAuthenticated && user?.role === "rider" && user?.email
      ? { email: String(user.email) }
      : "skip"
  );

  const pendingParkedRiderLoginAlert = useQuery(
    api.riders.getPendingRiderLoginAlert,
    // Shop (or guest) with parked rider — still get Yes/No for that rider account
    user?.role !== "rider"
      && parkedRiderSnap?.email
      ? { email: String(parkedRiderSnap.email) }
      : "skip"
  );

  const riderLoginBroadcast = useQuery(
    api.riders.getRiderLoginBroadcast,
    isAuthenticated && user?.role === "rider" && user?.email
      ? { email: String(user.email) }
      : "skip"
  );

  const parkedRiderLoginBroadcast = useQuery(
    api.riders.getRiderLoginBroadcast,
    user?.role !== "rider"
      && parkedRiderSnap?.email
      ? { email: String(parkedRiderSnap.email) }
      : "skip"
  );

  const seenLoginBroadcastRef = useRef("");

  useEffect(() => {
    seedAdminMutation({}).catch(() => {});
  }, []);

  // Chat Online/Offline — ping while customer/admin account is open anywhere in the app
  useEffect(() => {
    if (!isAuthenticated || !isReady || needsDeviceUnlock) return undefined;
    if (role !== "user" && role !== "admin") return undefined;

    const ping = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (role === "admin") {
        heartbeatChatPresence({ role: "admin" }).catch(() => {});
      } else if (user?.email) {
        heartbeatChatPresence({
          role: "customer",
          customerEmail: String(user.email),
        }).catch(() => {});
      }
    };

    ping();
    const id = setInterval(ping, 15000);
    const onVis = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [
    isAuthenticated,
    isReady,
    needsDeviceUnlock,
    role,
    user?.email,
    heartbeatChatPresence,
  ]);

  useEffect(() => {
    const storedUser = readAuthUser();
    const alive = isSessionAlive();
    const pwa = isStandalonePwa();
    const unlock = getDeviceUnlock(); // null after explicit logout
    const riderUnlock = getRiderDeviceUnlock();
    const loggedOut = wasExplicitLogout();
    const gate = readAuthGate();
    const gateLocked = isAuthGateLocked(gate);
    // App update reload — keep customer / admin / rider signed in (no PIN, no logout)
    const keepAfterUpdate = consumeKeepSessionAfterUpdate();

    const restoreSession = (withPinGate = false) => {
      // Don't mark session alive yet when PIN is required — otherwise a soft
      // reopen would skip the pink PIN gate on the next cold start.
      if (!withPinGate) markSessionAlive();
      if (storedUser.role === "user") {
        writeCustomerActivityAt(Date.now());
        customerActivityRef.current = Date.now();
      }
      setUser(storedUser);
      setRole(storedUser.role);
      setIsAuthenticated(true); // keep route/page under the PIN overlay
      setNeedsDeviceUnlock(withPinGate);
    };

    // Customer idle timeout across refresh / reopen
    if (
      storedUser?.role === "user"
      && !loggedOut
      && isCustomerIdleExpired()
    ) {
      clearAuthUser();
      clearSessionAlive();
      clearPendingLogin();
      clearCustomerActivityAt();
      markExplicitLogout();
      clearDeviceUnlock();
      markIdleLogoutNotice();
      setIdleSessionNotice(true);
      setUser(null);
      setRole(null);
      setIsAuthenticated(false);
      setNeedsDeviceUnlock(false);
      setIsReady(true);
      return;
    }

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

    // Just finished "Update now":
    // customers/admin stay signed in; riders must set/unlock PIN so close→reopen works
    if (keepAfterUpdate && !loggedOut) {
      try { clearAuthGate(); } catch { /* ignore */ }
      if (storedUser.role === "rider") {
        try { saveDeviceUnlock(storedUser); } catch { /* ignore */ }
        restoreSession(true);
      } else {
        restoreSession(false);
      }
      setIsReady(true);
      return;
    }

    // Only show PIN/reset UI again if THAT gate was open when they refreshed
    if ((gate === "reset" || gate === "pin") && storedUser && !loggedOut) {
      restoreSession(true);
      setIsReady(true);
      return;
    }

    const isRiderStored = storedUser.role === "rider";
    const hasCustomerUnlock =
      (!storedUser.role || storedUser.role === "user" || storedUser.role === "admin")
      && unlock?._id
      && String(unlock._id) === String(storedUser._id);
    const hasRiderUnlock =
      isRiderStored
      && riderUnlock?._id
      && (
        String(riderUnlock._id) === String(storedUser._id)
        || String(riderUnlock.email || "").toLowerCase() === String(storedUser.email || "").toLowerCase()
      );
    const hasUnlock = isRiderStored ? hasRiderUnlock : hasCustomerUnlock;

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
    // Keep heartbeat fresh so other-device login still shows Yes/No (not silent takeover)
    const id = window.setInterval(touch, 20_000);
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
    if (sessionUser.role === "user") {
      writeCustomerActivityAt(Date.now());
      customerActivityRef.current = Date.now();
      setIdleSessionNotice(false);
    } else {
      clearCustomerActivityAt();
    }
    if (
      sessionUser.role === "user"
      || sessionUser.role === "admin"
      || sessionUser.role === "rider"
    ) {
      saveDeviceUnlock(sessionUser);
    }
    if (sessionUser.role === "rider") {
      try { clearRiderExplicitLogoutFlag(); } catch { /* ignore */ }
      try { clearParkedRider(); } catch { /* ignore */ }
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
    clearCustomerActivityAt();
    markExplicitLogout();
    clearDeviceUnlock();
    try { sessionStorage.removeItem("dkmerch_push_asked"); } catch { /* ignore */ }
    setUser(null);
    setRole(null);
    setIsAuthenticated(false);
    setNeedsDeviceUnlock(false);
    setSecurityAlert(null);
    // Keep kickedRef true until a successful login so the kick toast
    // is not re-fired in a loop (which made it look "stuck").
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

  // Show FB-style alert on EVERY device still signed into this account
  // (incl. parked shop customer while the rider app is open)
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
    const parkedCustLoading =
      isAuthenticated
      && current?.role === "rider"
      && parkedCustSnap?._id
      && pendingParkedCustomerLoginAlert === undefined;
    const parkedRiderLoading =
      current?.role !== "rider"
      && parkedRiderSnap?.email
      && pendingParkedRiderLoginAlert === undefined;
    // Query still loading — don't clear / skip the notice
    if (customerLoading || riderLoading || parkedCustLoading || parkedRiderLoading) return;

    let pending = null;
    let previousUser = current;

    if (current?.role === "rider") {
      // Shop account notice while rider has a parked customer session
      const parkedPending = pendingParkedCustomerLoginAlert || null;
      const parked = (() => { try { return getParkedCustomer(); } catch { return null; } })();
      if (
        parkedPending
        && parked?._id
        && String(parked.sessionId || "") !== String(parkedPending.sessionId || "")
      ) {
        pending = parkedPending;
        previousUser = {
          _id: parked._id,
          id: parked._id || parked.id,
          name: parked.name || "",
          username: parked.username || "",
          email: parked.email || "",
          phone: parked.phone || "",
          role: parked.role === "admin" ? "admin" : "user",
          ...(parked.sessionId ? { sessionId: String(parked.sessionId) } : {}),
        };
      } else {
        pending = pendingRiderLoginAlert || null;
        previousUser = current;
      }
    } else if (current?.role === "user" || current?.role === "admin") {
      // Active shop notice first; parked rider notice if shop has none
      const parkedR = (() => { try { return getParkedRider(); } catch { return null; } })();
      const parkedRPending = pendingParkedRiderLoginAlert || null;
      if (pendingLoginAlert) {
        pending = pendingLoginAlert;
        previousUser = current;
      } else if (
        parkedRPending
        && parkedR?.email
        && String(parkedR.sessionId || "") !== String(parkedRPending.sessionId || "")
      ) {
        pending = parkedRPending;
        previousUser = {
          _id: parkedR._id || parkedR.id,
          id: parkedR._id || parkedR.id,
          name: parkedR.name || "Rider",
          email: parkedR.email,
          role: "rider",
          ...(parkedR.sessionId ? { sessionId: String(parkedR.sessionId) } : {}),
        };
      } else {
        pending = null;
        previousUser = current;
      }
    } else if (!current || !isAuthenticated) {
      // Guest browsing shop with parked rider
      const parkedR = (() => { try { return getParkedRider(); } catch { return null; } })();
      const parkedRPending = pendingParkedRiderLoginAlert || null;
      if (
        parkedRPending
        && parkedR?.email
        && String(parkedR.sessionId || "") !== String(parkedRPending.sessionId || "")
      ) {
        pending = parkedRPending;
        previousUser = {
          _id: parkedR._id || parkedR.id,
          id: parkedR._id || parkedR.id,
          name: parkedR.name || "Rider",
          email: parkedR.email,
          role: "rider",
          ...(parkedR.sessionId ? { sessionId: String(parkedR.sessionId) } : {}),
        };
      }
    }

    if (!pending) {
      // Don't wipe a held confirmation (approved/denied local UI); only clear live pending
      setSecurityAlert((prev) => (prev?.mode === "pending" ? null : prev));
      return;
    }
    if (holdLogoutConfirmRef.current) return;
    // Show above PIN too (modal z-index is higher) so the notice never "disappears"
    if (!previousUser) return;
    // Don't show Yes/No on the device that is waiting for approval
    if (String(previousUser.sessionId || "") === String(pending.sessionId || "")) return;
    if (String(current?.sessionId || "") === String(pending.sessionId || "")) return;
    try { clearAuthGate(); } catch { /* ignore */ }
    let shouldToast = false;
    setSecurityAlert((prev) => {
      const same =
        prev?.mode === "pending"
        && String(prev?.alert?.sessionId || "") === String(pending.sessionId || "");
      if (!same) shouldToast = true;
      return {
        alert: pending,
        previousUser,
        mode: "pending",
      };
    });
    if (shouldToast) {
      // Defer toast so we never setState NotificationProvider during AuthProvider render
      queueMicrotask(() => {
        try {
          showNotification(
            `Login request · ${pending.deviceName || "another device"}`,
            "warning",
            { duration: 3200, dedupeKey: `login-alert-pending:${pending.sessionId}` }
          );
        } catch { /* ignore */ }
      });
    }
    clearLoginAlertDeepLink();
  }, [
    pendingLoginAlert,
    pendingParkedCustomerLoginAlert,
    pendingParkedRiderLoginAlert,
    pendingRiderLoginAlert,
    parkedCustSnap,
    parkedRiderSnap,
    isAuthenticated,
    showNotification,
  ]);

  // Fan-out toast on ALL devices when account is requested / opened / blocked
  useEffect(() => {
    const current = userRef.current;
    let broadcast = null;
    if (current?.role === "rider") {
      if (!isAuthenticated) return;
      broadcast = parkedCustomerLoginBroadcast || riderLoginBroadcast || null;
    } else if (current?.role === "user" || current?.role === "admin") {
      if (!isAuthenticated) return;
      broadcast = loginBroadcast || parkedRiderLoginBroadcast || null;
    } else {
      // Guest with parked rider
      broadcast = parkedRiderLoginBroadcast || null;
    }
    if (!broadcast?.kind || !broadcast?.at) return;
    // Waiting new device already has its own pending-approval UI
    if (String(current?.sessionId || "") === String(broadcast.sessionId || "")) return;
    const parkedCust = (() => { try { return getParkedCustomer(); } catch { return null; } })();
    if (
      parkedCust?.sessionId
      && String(parkedCust.sessionId) === String(broadcast.sessionId || "")
    ) return;
    const parkedR = (() => { try { return getParkedRider(); } catch { return null; } })();
    if (
      parkedR?.sessionId
      && String(parkedR.sessionId) === String(broadcast.sessionId || "")
    ) return;

    const key = `${broadcast.kind}:${broadcast.sessionId}:${broadcast.at}`;
    if (seenLoginBroadcastRef.current === key) return;
    seenLoginBroadcastRef.current = key;

    const device = broadcast.deviceName || "another device";
    const where = broadcast.location ? ` · ${broadcast.location}` : "";

    queueMicrotask(() => {
      try {
        if (broadcast.kind === "request") {
          showNotification(
            `Sign-in request · ${device}`,
            "warning",
            { duration: 3200, dedupeKey: key }
          );
        } else if (broadcast.kind === "opened") {
          showNotification(
            `Opened on ${device}`,
            "info",
            { duration: 2600, dedupeKey: key }
          );
        } else if (broadcast.kind === "blocked") {
          showNotification(
            `Sign-in blocked · ${device}`,
            "success",
            { duration: 2600, dedupeKey: key }
          );
        }
      } catch { /* ignore */ }
    });
  }, [loginBroadcast, parkedCustomerLoginBroadcast, parkedRiderLoginBroadcast, riderLoginBroadcast, isAuthenticated, showNotification]);

  // Push tap — open Yes/No as soon as pending alert is available (even over PIN)
  useEffect(() => {
    const bump = () => {
      try { sessionStorage.setItem("dkmerch_open_login_alert", "1"); } catch { /* ignore */ }
      const current = userRef.current;
      const pending =
        current?.role === "rider"
          ? (pendingRiderLoginAlert || null)
          : (current?.role === "user" || current?.role === "admin")
            ? (pendingLoginAlert || null)
            : null;
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

  // Sign out if THIS session was removed (takeover / logout-all / admin suspend)
  useEffect(() => {
    if (!sessionCheck || sessionCheck.valid !== false) return;
    if (
      sessionCheck.reason !== "new_device_logged_in"
      && sessionCheck.reason !== "session_revoked"
      && sessionCheck.reason !== "account_suspended"
    ) return;
    if (holdLogoutConfirmRef.current) return;
    // Keep owner signed in while approving / blocking the other device
    if (
      sessionCheck.reason !== "account_suspended"
      && (securityAlert?.mode === "pending" || securityAlert?.mode === "approved")
    ) return;
    if (
      sessionCheck.reason !== "account_suspended"
      && (pendingLoginAlert || pendingRiderLoginAlert)
    ) return;
    if (kickedRef.current) return;
    kickedRef.current = true;
    const device = sessionCheck.activeDeviceName || "another device";
    const kickMsg =
      sessionCheck.reason === "account_suspended"
        ? "Your account has been suspended. Please contact support."
        : sessionCheck.reason === "new_device_logged_in"
          ? `Signed out · opened on ${device}`
          : `Signed out · ${device}`;
    queueMicrotask(() => {
      try {
        showNotification(kickMsg, "warning", {
          duration: 4200,
          dedupeKey: `session-kick:${sessionCheck.reason}:${device}`,
        });
      } catch { /* ignore */ }
    });
    finishSecurityLogout();
  }, [sessionCheck, securityAlert, pendingLoginAlert, pendingRiderLoginAlert, showNotification]);

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
      `Login approved · ${device}`,
      "success",
      { duration: 2600, dedupeKey: "login-alert-yes" }
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
      "Login blocked · still signed in here",
      "success",
      { duration: 2600, dedupeKey: "login-alert-no" }
    );
  };

  const login = async (identifier, password, mode) => {
    try {
      // ══════════════════════════════════════════
      // RIDER LOGIN
      // ══════════════════════════════════════════
      if (mode === "rider") {
        const device = await collectLoginDeviceInfo({ fast: true });
        const storedAuth = readAuthUser();
        const parked = getParkedRider();
        const idLower = String(identifier || "").trim().toLowerCase();
        const reuseFromStored =
          storedAuth?.role === "rider"
          && String(storedAuth?.email || "").toLowerCase() === idLower
          && storedAuth?.sessionId
            ? String(storedAuth.sessionId).trim()
            : "";
        // Same-device park heartbeat must not look like "another device"
        const reuseFromParked =
          parked?.email
          && String(parked.email).toLowerCase() === idLower
          && parked?.sessionId
            ? String(parked.sessionId).trim()
            : "";
        const reuseSessionId = reuseFromStored || reuseFromParked;
        const riderResult = await loginRiderMutation({
          email: identifier,
          password,
          deviceName: device.deviceName,
          location: device.location,
          platform: device.platform,
          currentSessionId: reuseSessionId || undefined,
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

        try { clearParkedRider(); } catch { /* ignore */ }
        applySession(sessionRider);
        safeLog({
          action: "login",
          actorEmail: sessionRider.email,
          actorName: sessionRider.name,
          actorRole: "rider",
          details: "Rider login success",
        });
        return {
          success: true,
          role: "rider",
          user: sessionRider,
          needsPinSetup: !riderResult.hasPin,
        };
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
        const storedAuth = readAuthUser();
        const reuseSessionId = String(
          (storedAuth?.role === "rider" && storedAuth?.email === identifier && storedAuth?.sessionId)
          || ""
        ).trim();
        const riderResult = await loginRiderMutation({
          email: identifier,
          password,
          deviceName: device.deviceName,
          location: device.location,
          platform: device.platform,
          currentSessionId: reuseSessionId || undefined,
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
    // PIN unlock / parked shop session may omit sessionId — reuse same-device session
    const storedAuth = readAuthUser();
    const unlockSnap = (() => {
      try { return getDeviceUnlock(); } catch { return null; }
    })();
    const parkedCust = (() => {
      try { return getParkedCustomer(); } catch { return null; }
    })();
    const sameId = (a, b) => String(a || "") === String(b || "");
    const reuseFromParked =
      parkedCust?._id
      && sameId(parkedCust._id, pendingUser._id)
      && parkedCust.sessionId
        ? String(parkedCust.sessionId).trim()
        : "";
    const reuseFromUnlock =
      unlockSnap?._id
      && sameId(unlockSnap._id, pendingUser._id)
      && unlockSnap.sessionId
        ? String(unlockSnap.sessionId).trim()
        : "";
    const reuseFromStored =
      storedAuth?._id
      && sameId(storedAuth._id, pendingUser._id)
      && (storedAuth.role === "user" || storedAuth.role === "admin")
      && storedAuth.sessionId
        ? String(storedAuth.sessionId).trim()
        : "";
    const reuseSessionId = String(
      pendingUser.sessionId
      || reuseFromParked
      || reuseFromStored
      || reuseFromUnlock
      || (
        userRef.current?._id
        && sameId(userRef.current._id, pendingUser._id)
        && userRef.current.sessionId
      )
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
        // Same-device park / PIN unlock — never treat as another live device
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
    const wasRider = prev?.role === "rider";
    clearAuthUser();
    clearSessionAlive();
    clearPendingLogin();
    try { clearParkedRider(); } catch { /* ignore */ }
    try { clearParkedCustomer(); } catch { /* ignore */ }
    try { localStorage.removeItem(LAST_ACTIVE_KEY); } catch { /* ignore */ }
    clearCustomerActivityAt();
    if (keepUnlock) {
      // Stay on PIN chrome — do not mark explicit logout / wipe unlock profile
      setNeedsDeviceUnlock(false);
    } else if (wasRider) {
      markRiderExplicitLogout();
      clearRiderDeviceUnlock();
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
  logoutRef.current = logout;

  // Customer-only: auto-logout after 10 minutes with no real activity + popup
  useEffect(() => {
    if (!isReady || !isAuthenticated || role !== "user" || needsDeviceUnlock) {
      return undefined;
    }

    const now = Date.now();
    const stored = readCustomerActivityAt() || now;
    customerActivityRef.current = stored;
    writeCustomerActivityAt(stored);

    let writeThrottle = 0;
    const bump = () => {
      const ts = Date.now();
      customerActivityRef.current = ts;
      if (ts - writeThrottle < 2000) return;
      writeThrottle = ts;
      writeCustomerActivityAt(ts);
    };

    const events = [
      "pointerdown",
      "keydown",
      "touchstart",
      "scroll",
      "mousemove",
      "click",
      "wheel",
    ];
    events.forEach((ev) => window.addEventListener(ev, bump, { passive: true, capture: true }));
    const onVis = () => {
      if (document.visibilityState === "visible") bump();
    };
    document.addEventListener("visibilitychange", onVis);

    const check = () => {
      const last = customerActivityRef.current || readCustomerActivityAt();
      if (!last) {
        bump();
        return;
      }
      if (Date.now() - last < CUSTOMER_IDLE_MS) return;
      clearCustomerActivityAt();
      customerActivityRef.current = 0;
      markIdleLogoutNotice();
      setIdleSessionNotice(true);
      try { logoutRef.current?.(); } catch { /* ignore */ }
      try {
        if (
          window.location.pathname.startsWith("/checkout")
          || window.location.pathname.startsWith("/settings")
          || window.location.pathname.startsWith("/chat")
        ) {
          window.location.assign("/");
        }
      } catch { /* ignore */ }
    };

    const id = window.setInterval(check, 15_000);
    check();
    return () => {
      window.clearInterval(id);
      events.forEach((ev) => window.removeEventListener(ev, bump, { capture: true }));
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [isReady, isAuthenticated, role, needsDeviceUnlock]);

  const clearDeviceUnlockPrompt = () => setNeedsDeviceUnlock(false);

  /** After rider PIN verify — restore session without password / new-device alert. */
  const completeRiderPinUnlock = async (riderProfile) => {
    const email = String(riderProfile?.email || "").trim().toLowerCase();
    if (!email) return { success: false, message: "Missing rider profile." };
    const sessionId = String(riderProfile.sessionId || "").trim();
    let nextSessionId = sessionId;
    try {
      const touch = await touchRiderSession({
        email,
        sessionId: sessionId || undefined,
      });
      if (touch?.sessionId) nextSessionId = String(touch.sessionId);
    } catch { /* optional */ }
    const sessionRider = {
      _id: riderProfile._id || riderProfile.id,
      id: riderProfile._id || riderProfile.id,
      name: riderProfile.name || "Rider",
      email,
      role: "rider",
      ...(nextSessionId ? { sessionId: nextSessionId } : {}),
    };
    applySession(sessionRider);
    return { success: true, role: "rider", user: sessionRider };
  };

  const [roleSwitchLoading, setRoleSwitchLoading] = useState(null); // 'to-shop' | 'to-rider' | null

  const beginRoleSwitch = (direction) => {
    setRoleSwitchLoading(direction === "to-rider" ? "to-rider" : "to-shop");
  };
  const endRoleSwitch = () => setRoleSwitchLoading(null);

  const toCustomerSessionUser = (profile) => {
    if (!profile?._id && !profile?.id) return null;
    const role = profile.role === "admin" ? "admin" : "user";
    return {
      _id: profile._id || profile.id,
      id: profile._id || profile.id,
      name: profile.name || "",
      username: profile.username || "",
      email: profile.email || "",
      phone: profile.phone || "",
      role,
      ...(profile.sessionId ? { sessionId: String(profile.sessionId) } : {}),
    };
  };

  /**
   * Rider → Shop: park rider (keep server session).
   * Same device: always restore the parked/last customer login on this phone —
   * never log the customer out just because we switched roles.
   */
  const switchRiderToShop = () => {
    const prev = userRef.current;
    if (!prev || prev.role !== "rider") return { success: false, message: "Not a rider session." };
    parkRiderSession(prev);

    // Same device = keep whatever customer account was already used here
    const parkedCust = getParkedCustomer();
    const unlockCust = getDeviceUnlock();
    const customerProfile = parkedCust?._id ? parkedCust : (unlockCust?._id ? unlockCust : null);

    const customerSession = toCustomerSessionUser(customerProfile);
    if (customerSession) {
      // Stay signed in as customer — do NOT end rider/customer server sessions
      clearParkedCustomer();
      clearExplicitLogoutFlag();
      clearPendingLogin();
      try { clearAuthGate(); } catch { /* ignore */ }
      setSecurityAlert(null);
      holdLogoutConfirmRef.current = false;
      kickedRef.current = false;
      writeAuthUser(customerSession);
      markSessionAlive();
      saveDeviceUnlock(customerSession);
      userRef.current = customerSession;
      setUser(customerSession);
      setRole(customerSession.role);
      setIsAuthenticated(true);
      setNeedsDeviceUnlock(false);
      // Resume the SAME parked session on the server (never new-login / Yes-No)
      if (customerSession._id) {
        const resumeSid = customerSession.sessionId ? String(customerSession.sessionId) : undefined;
        startUserSession({
          userId: customerSession._id,
          currentSessionId: resumeSid,
          deviceName: "This device",
          location: "Same device",
          platform: typeof navigator !== "undefined" ? navigator.platform : undefined,
        })
          .then((res) => {
            if (!res?.success || !res.sessionId) return;
            if (res.pendingApproval) return; // should not happen when resuming
            const u = userRef.current;
            if (!u || String(u._id) !== String(customerSession._id)) return;
            if (String(u.sessionId || "") === String(res.sessionId)) return;
            const next = { ...u, sessionId: String(res.sessionId) };
            userRef.current = next;
            writeAuthUser(next);
            setUser(next);
            saveDeviceUnlock(next);
          })
          .catch(() => {
            touchUserSession({
              userId: String(customerSession._id),
              sessionId: resumeSid,
            }).catch(() => {});
          });
      }
      return {
        success: true,
        parked: getParkedRider(),
        restoredCustomer: true,
        needsCustomerLogin: false,
      };
    }

    // No customer login ever saved on this device — guest shop (still no rider logout)
    clearAuthUser();
    // Keep sessionAlive so we don't wipe device unlock profiles on next boot
    userRef.current = null;
    setUser(null);
    setRole(null);
    setIsAuthenticated(false);
    setNeedsDeviceUnlock(false);
    return {
      success: true,
      parked: getParkedRider(),
      restoredCustomer: false,
      needsCustomerLogin: true,
    };
  };

  /**
   * Free Rider↔Shop switch only when BOTH are present on this device:
   * parked rider + active customer login. Guest shop → must log in as rider.
   */
  const canFreeSwitchToRider = () => {
    const parked = getParkedRider();
    if (!parked?.email) return false;
    const cur = userRef.current;
    return !!(cur && (cur.role === "user" || cur.role === "admin") && cur._id);
  };

  /** Restore parked rider; park active customer so shop login is kept. */
  const restoreParkedRider = () => {
    const parked = getParkedRider();
    if (!parked?.email) return { success: false, message: "No parked rider session." };

    const prev = userRef.current;
    // Require customer login on this device — no direct switch while guest
    if (!prev || (prev.role !== "user" && prev.role !== "admin") || !prev._id) {
      return {
        success: false,
        needsRiderLogin: true,
        message: "Log in to open the Rider app.",
      };
    }

    parkCustomerSession(prev);
    // Soft-clear customer active slot only — do NOT endUserSession

    const sessionUser = {
      _id: parked._id || parked.id,
      id: parked._id || parked.id,
      name: parked.name || "Rider",
      email: parked.email,
      role: "rider",
      ...(parked.sessionId ? { sessionId: String(parked.sessionId) } : {}),
    };
    clearRiderBrowsingFlag();
    clearParkedRider();
    applySession(sessionUser);
    return { success: true, user: sessionUser };
  };

  // Keep parked rider server session alive while browsing shop (guest or customer)
  useEffect(() => {
    const tick = () => {
      const parked = getParkedRider();
      if (!parked?.email) return;
      // Active rider doesn't need parked heartbeat
      if (userRef.current?.role === "rider") return;
      touchRiderSession({
        email: String(parked.email),
        sessionId: parked.sessionId ? String(parked.sessionId) : undefined,
      }).catch(() => {});
    };
    tick();
    const id = window.setInterval(tick, 20_000);
    return () => window.clearInterval(id);
  }, [isAuthenticated, role, touchRiderSession]);

  // Keep parked customer server session alive while in rider app
  useEffect(() => {
    if (!isAuthenticated || role !== "rider") return undefined;
    const tick = () => {
      const parked = getParkedCustomer();
      if (!parked?._id) return;
      touchUserSession({
        userId: String(parked._id),
        sessionId: parked.sessionId ? String(parked.sessionId) : undefined,
      }).catch(() => {});
    };
    tick();
    const id = window.setInterval(tick, 20_000);
    return () => window.clearInterval(id);
  }, [isAuthenticated, role, touchUserSession]);

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
        switchRiderToShop,
        restoreParkedRider,
        canFreeSwitchToRider,
        getParkedRider,
        isRiderBrowsingShop,
        completeRiderPinUnlock,
        roleSwitchLoading,
        beginRoleSwitch,
        endRoleSwitch,
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
      <SessionIdleModal
        open={idleSessionNotice}
        minutes={10}
        onClose={() => {
          try { sessionStorage.removeItem(IDLE_NOTICE_KEY); } catch { /* ignore */ }
          setIdleSessionNotice(false);
        }}
      />
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
    switchRiderToShop: () => ({ success: false }),
    restoreParkedRider: () => ({ success: false }),
    canFreeSwitchToRider: () => false,
    getParkedRider: () => null,
    isRiderBrowsingShop: () => false,
    completeRiderPinUnlock: async () => ({ success: false }),
    roleSwitchLoading: null,
    beginRoleSwitch: () => {},
    endRoleSwitch: () => {},
  };
};
