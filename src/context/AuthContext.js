// src/context/AuthContext.js
import React, { createContext, useContext, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

const AuthContext = createContext(null);

const SESSION_KEY = "riderSessionId"; // sessionStorage key for rider session only

export const AuthProvider = ({ children }) => {
  const [user, setUser]                       = useState(null);
  const [role, setRole]                       = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isReady, setIsReady]                 = useState(false);

  const loginUserMutation  = useMutation(api.users.loginUser);
  const seedAdminMutation  = useMutation(api.users.seedAdmin);
  const loginRiderMutation = useMutation(api.riders.loginRider);
  const createUserMutation = useMutation(api.users.createUser);

  useEffect(() => {
    seedAdminMutation({}).catch(() => {});
  }, []);

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("authUser") || "null");
    if (storedUser) {
      setUser(storedUser);
      setRole(storedUser.role);
      setIsAuthenticated(true);

      if (storedUser.role === "rider") {
        const savedSession = sessionStorage.getItem(SESSION_KEY);
        if (!savedSession) {
          localStorage.removeItem("authUser");
          setUser(null);
          setRole(null);
          setIsAuthenticated(false);
        } else {
          setUser({ ...storedUser, sessionId: savedSession });
        }
      }
    }
    setIsReady(true);
  }, []);

  // ─────────────────────────────────────────────────────────────────
  // ✅ login() accepts an optional `mode` param:
  //    mode = "user"  → only tries users table (customers + admin)
  //    mode = "rider" → only tries riderApplications table
  //    mode = undefined → legacy behavior (tries user first, then rider)
  //
  // LoginModal passes mode="user" for customer login
  // and mode="rider" for rider login — fully separated.
  // ─────────────────────────────────────────────────────────────────
  const login = async (identifier, password, mode) => {
    try {

      // ══════════════════════════════════════════
      // RIDER LOGIN — only when mode === "rider"
      // ══════════════════════════════════════════
      if (mode === "rider") {
        const riderResult = await loginRiderMutation({ email: identifier, password });

        // riderExists = false means the email is not in riderApplications at all
        if (!riderResult.riderExists) {
          return {
            success: false,
            message: "No rider account found with this email. Please register as a rider first.",
          };
        }

        // riderExists = true but login failed (wrong pw, pending, rejected, suspended)
        if (!riderResult.success) {
          return { success: false, message: riderResult.message };
        }

        // ✅ Rider login success
        const sessionRider = {
          _id: riderResult.rider._id,
          id:  riderResult.rider._id,
          name:  riderResult.rider.name,
          email: riderResult.rider.email,
          role:  "rider",
        };

        localStorage.setItem("authUser", JSON.stringify(sessionRider));
        sessionStorage.setItem(SESSION_KEY, riderResult.sessionId);

        const userWithSession = { ...sessionRider, sessionId: riderResult.sessionId };
        setUser(userWithSession);
        setRole("rider");
        setIsAuthenticated(true);
        return { success: true, role: "rider" };
      }

      // ══════════════════════════════════════════
      // USER / ADMIN LOGIN — only when mode === "user" (or undefined for legacy)
      // ══════════════════════════════════════════
      if (mode === "user" || !mode) {
        const result = await loginUserMutation({ identifier, password });

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
          localStorage.setItem("authUser", JSON.stringify(sessionUser));
          setUser(sessionUser);
          setRole(sessionUser.role);
          setIsAuthenticated(true);
          return { success: true, role: sessionUser.role };
        }

        // ✅ mode === "user" → do NOT fall through to rider login
        // Show the error from users table only
        if (mode === "user") {
          return {
            success: false,
            message: result.message || "Invalid email/username or password.",
          };
        }

        // Legacy (no mode): still try rider as fallback
        const riderResult = await loginRiderMutation({ email: identifier, password });

        if (riderResult.riderExists) {
          if (riderResult.success && riderResult.rider) {
            const sessionRider = {
              _id:   riderResult.rider._id,
              id:    riderResult.rider._id,
              name:  riderResult.rider.name,
              email: riderResult.rider.email,
              role:  "rider",
            };
            localStorage.setItem("authUser", JSON.stringify(sessionRider));
            sessionStorage.setItem(SESSION_KEY, riderResult.sessionId);
            const userWithSession = { ...sessionRider, sessionId: riderResult.sessionId };
            setUser(userWithSession);
            setRole("rider");
            setIsAuthenticated(true);
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
      return result;
    } catch (err) {
      console.error("Register error:", err);
      return { success: false, message: "Registration failed. Please try again." };
    }
  };

  const updateUser = (updatedFields) => {
    setUser(prev => {
      const updated = { ...prev, ...updatedFields };
      const toStore = { ...updated };
      delete toStore.sessionId;
      localStorage.setItem("authUser", JSON.stringify(toStore));
      return updated;
    });
  };

  const logout = () => {
    localStorage.removeItem("authUser");
    sessionStorage.removeItem(SESSION_KEY);
    setUser(null);
    setRole(null);
    setIsAuthenticated(false);
  };

  if (!isReady) return null;

  return (
    <AuthContext.Provider value={{ user, role, isAuthenticated, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);