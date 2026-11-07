// src/context/AuthContext.js
import React, { createContext, useContext, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { appendActivityLog } from "../admin/lib/localActivityLog";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser]                       = useState(null);
  const [role, setRole]                       = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isReady, setIsReady]                 = useState(false);

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
    const storedUser = JSON.parse(localStorage.getItem("authUser") || "null");
    if (storedUser) {
      setUser(storedUser);
      setRole(storedUser.role);
      setIsAuthenticated(true);
    }
    setIsReady(true);
  }, []);

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

        localStorage.setItem("authUser", JSON.stringify(sessionRider));
        setUser(sessionRider);
        setRole("rider");
        setIsAuthenticated(true);
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

        // ── Successful login ──
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
            localStorage.setItem("authUser", JSON.stringify(sessionRider));
            setUser(sessionRider);
            setRole("rider");
            setIsAuthenticated(true);
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

  const updateUser = (updatedFields) => {
    setUser(prev => {
      const updated = { ...prev, ...updatedFields };
      const toStore = { ...updated };
      localStorage.setItem("authUser", JSON.stringify(toStore));
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
    localStorage.removeItem("authUser");
    setUser(null);
    setRole(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ user, role, isAuthenticated, isReady, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);