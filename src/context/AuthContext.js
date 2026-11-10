// src/context/AuthContext.js
import React, { createContext, useContext, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { appendActivityLog } from "../admin/lib/localActivityLog";
import { saveDeviceUnlock, clearDeviceUnlock, getDeviceUnlock } from "../lib/deviceUnlock";

const AuthContext = createContext(null);
const AUTH_USER_KEY = "authUser";
const SESSION_ALIVE_KEY = "dkmerch_session_alive";

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

/** True when this load is a refresh/reload (not a cold app open). */
function isPageReload() {
  try {
    const nav = performance.getEntriesByType?.("navigation")?.[0];
    if (nav?.type === "reload") return true;
    // Legacy Safari / older WebKit
    if (typeof performance !== "undefined" && performance.navigation?.type === 1) return true;
  } catch { /* ignore */ }
  return false;
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
  const [user, setUser]                       = useState(null);
  const [role, setRole]                       = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isReady, setIsReady]                 = useState(false);
  // Cold start (app closed then opened): prompt PIN unlock, not full login
  const [needsDeviceUnlock, setNeedsDeviceUnlock] = useState(false);

  const loginUserMutation  = useMutation(api.users.loginUser);
  const seedAdminMutation  = useMutation(api.users.seedAdmin);
  const loginRiderMutation = useMutation(api.riders.loginRider);
  const createUserMutation = useMutation(api.users.createUser);

  const safeLog = (payload) => {
    try { appendActivityLog(payload); } catch {}
  };

  useEffect(() => {
    seedAdminMutation({}).catch(() => {});
  }, []);

  useEffect(() => {
    const storedUser = readAuthUser();
    const alive = isSessionAlive();
    const pwa = isStandalonePwa();

    if (storedUser && alive) {
      // Same session — stay logged in, no PIN; keep current route/tab
      setUser(storedUser);
      setRole(storedUser.role);
      setIsAuthenticated(true);
      setNeedsDeviceUnlock(false);
    } else if (storedUser && !alive && isPageReload()) {
      // Pull-to-refresh / reload — stay on this page, never show PIN
      markSessionAlive();
      setUser(storedUser);
      setRole(storedUser.role);
      setIsAuthenticated(true);
      setNeedsDeviceUnlock(false);
    } else if (storedUser && !alive && pwa) {
      // Installed app closed then opened — PIN unlock for customers
      const unlock = getDeviceUnlock();
      const isCustomer = !storedUser.role || storedUser.role === "user";
      if (isCustomer && unlock?._id && String(unlock._id) === String(storedUser._id)) {
        setNeedsDeviceUnlock(true);
        setUser(null);
        setRole(null);
        setIsAuthenticated(false);
      } else if (!isCustomer) {
        clearAuthUser();
        setUser(null);
        setRole(null);
        setIsAuthenticated(false);
        setNeedsDeviceUnlock(false);
      } else {
        clearAuthUser();
        clearDeviceUnlock();
        setUser(null);
        setRole(null);
        setIsAuthenticated(false);
        setNeedsDeviceUnlock(false);
      }
    } else if (storedUser && !alive && !pwa) {
      // Regular browser (Brave/Chrome): keep session across tab close — no PIN popup
      markSessionAlive();
      setUser(storedUser);
      setRole(storedUser.role);
      setIsAuthenticated(true);
      setNeedsDeviceUnlock(false);
    } else {
      setNeedsDeviceUnlock(false);
    }
    setIsReady(true);
  }, []);

  const applySession = (sessionUser) => {
    writeAuthUser(sessionUser);
    markSessionAlive();
    if (sessionUser.role === "user") saveDeviceUnlock(sessionUser);
    setUser(sessionUser);
    setRole(sessionUser.role);
    setIsAuthenticated(true);
    setNeedsDeviceUnlock(false);
  };

  const login = async (identifier, password, mode) => {
    try {
      // ══════════════════════════════════════════
      // RIDER LOGIN
      // ══════════════════════════════════════════
      if (mode === "rider") {
        const riderResult = await loginRiderMutation({ email: identifier, password });

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

          // Customers NEVER fully sign in on password alone —
          // always hand off to LoginModal for PIN (or first-time PIN setup).
          if (sessionUser.role === "user" && !result.skipSecondFactor) {
            const needsPin = !!result.needsPin;
            return {
              success: true,
              needsPin,
              needsPinSetup: !needsPin,
              pendingUser: sessionUser,
              role: "user",
            };
          }

          applySession(sessionUser);
          safeLog({
            action: "login",
            actorEmail: sessionUser.email,
            actorName: sessionUser.name,
            actorRole: sessionUser.role,
            details: "Account login success",
          });
          return { success: true, role: sessionUser.role };
        }

        // ── Self-deactivated account — pass through the flag so LoginModal
        //    can show the reactivation flow instead of the generic error ──
        if (result.deactivated) {
          return {
            success:   false,
            deactivated: true,
            userEmail: result.userEmail,
            userName:  result.userName,
            message:   result.message,
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
        const riderResult = await loginRiderMutation({ email: identifier, password });

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

  /** Finish login after PIN verify / PIN create (customer accounts). */
  const completeLogin = (pendingUser, details = "Account login success") => {
    if (!pendingUser?._id) return { success: false };
    const sessionUser = {
      _id:      pendingUser._id,
      id:       pendingUser._id,
      name:     pendingUser.name,
      username: pendingUser.username,
      email:    pendingUser.email,
      phone:    pendingUser.phone || "",
      role:     pendingUser.role || "user",
    };
    applySession(sessionUser);
    safeLog({
      action: "login",
      actorEmail: sessionUser.email,
      actorName: sessionUser.name,
      actorRole: sessionUser.role,
      details,
    });
    return { success: true, role: sessionUser.role };
  };

  const updateUser = (updatedFields) => {
    setUser(prev => {
      const updated = { ...prev, ...updatedFields };
      writeAuthUser(updated);
      return updated;
    });
  };

  const logout = () => {
    if (user) {
      safeLog({
        action: "logout",
        actorEmail: user.email,
        actorName: user.name,
        actorRole: user.role || role || undefined,
        details: "User logged out",
      });
    }
    clearAuthUser();
    clearSessionAlive();
    // Explicit logout → next time must use email/password (not PIN unlock)
    clearDeviceUnlock();
    try { sessionStorage.removeItem("dkmerch_push_asked"); } catch { /* ignore */ }
    setUser(null);
    setRole(null);
    setIsAuthenticated(false);
    setNeedsDeviceUnlock(false);
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
        register,
        logout,
        updateUser,
      }}
    >
      {children}
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
    register: async () => ({ success: false, message: "Auth not ready." }),
    logout: () => {},
    updateUser: () => {},
  };
};
