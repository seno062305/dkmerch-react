// src/context/AuthContext.js
import React, { createContext, useContext, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const loginUserMutation  = useMutation(api.users.loginUser);
  const seedAdminMutation  = useMutation(api.users.seedAdmin);
  const loginRiderMutation = useMutation(api.riders.loginRider);
  const createUserMutation = useMutation(api.users.createUser);

  useEffect(() => {
    seedAdminMutation({}).catch(() => {});
  }, []);

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("authUser"));
    if (storedUser) {
      setUser(storedUser);
      setRole(storedUser.role);
      setIsAuthenticated(true);
    }
    setIsReady(true);
  }, []);

  const login = async (identifier, password) => {
    try {
      // 1. Try regular user login
      const result = await loginUserMutation({ identifier, password });

      if (result.success && result.user) {
        const sessionUser = {
          _id: result.user._id,
          id: result.user._id,
          name: result.user.name,
          username: result.user.username,
          email: result.user.email,
          phone: result.user.phone || '',
          role: result.user.role,
        };
        localStorage.setItem("authUser", JSON.stringify(sessionUser));
        setUser(sessionUser);
        setRole(sessionUser.role);
        setIsAuthenticated(true);
        return { success: true, role: sessionUser.role };
      }

      // 2. Try rider login
      const riderResult = await loginRiderMutation({ email: identifier, password });

      // Rider account exists — show specific message (pending, rejected, wrong password, etc.)
      if (riderResult.riderExists) {
        if (riderResult.success && riderResult.rider) {
          const sessionRider = {
            _id: riderResult.rider._id,
            id: riderResult.rider._id,
            name: riderResult.rider.name,
            email: riderResult.rider.email,
            role: "rider",
          };
          localStorage.setItem("authUser", JSON.stringify(sessionRider));
          setUser(sessionRider);
          setRole("rider");
          setIsAuthenticated(true);
          return { success: true, role: "rider" };
        }
        // Rider exists but blocked (pending/rejected/suspended/wrong password)
        return { success: false, message: riderResult.message };
      }

      // 3. No match in either users or riders
      return {
        success: false,
        message: result.message || "Invalid username/email or password.",
      };
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

  // ✅ NEW: Update local user state + localStorage after profile save
  const updateUser = (updatedFields) => {
    setUser(prev => {
      const updated = { ...prev, ...updatedFields };
      localStorage.setItem("authUser", JSON.stringify(updated));
      return updated;
    });
  };

  const logout = () => {
    localStorage.removeItem("authUser");
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