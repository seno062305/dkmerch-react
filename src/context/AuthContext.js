import React, { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

const BUILT_IN_ADMIN = {
  id: 0,
  name: "Administrator",
  username: "admin",
  email: "admin",
  password: "admin123",
  role: "admin"
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Ensure admin exists in localStorage
  useEffect(() => {
    const users = JSON.parse(localStorage.getItem("users")) || [];
    const adminExists = users.some(u => u.email === BUILT_IN_ADMIN.email);
    if (!adminExists) {
      localStorage.setItem("users", JSON.stringify([BUILT_IN_ADMIN, ...users]));
    }
  }, []);

  // Load logged in user on mount
  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("authUser"));
    if (storedUser) {
      // Always re-check rider approval status on mount
      if (storedUser.role === 'rider') {
        const apps = JSON.parse(localStorage.getItem('dkmerch_rider_applications')) || [];
        const riderApp = apps.find(a => a.email === storedUser.email);
        if (riderApp && riderApp.status !== 'approved') {
          // Rider was revoked, clear session
          localStorage.removeItem("authUser");
          return;
        }
      }
      setUser(storedUser);
      setRole(storedUser.role);
      setIsAuthenticated(true);
    }
  }, []);

  // LOGIN - accepts username or email
  const login = (identifier, password) => {
    // Check regular users first
    const users = JSON.parse(localStorage.getItem("users")) || [];
    const foundUser = users.find(
      u => (u.username === identifier || u.email === identifier) && u.password === password
    );

    if (foundUser) {
      localStorage.setItem("authUser", JSON.stringify(foundUser));
      setUser(foundUser);
      setRole(foundUser.role);
      setIsAuthenticated(true);
      return { success: true, role: foundUser.role };
    }

    // Check if this is a rider login (by email)
    const riderApps = JSON.parse(localStorage.getItem('dkmerch_rider_applications')) || [];
    const riderApp = riderApps.find(a => a.email === identifier);

    if (riderApp) {
      if (riderApp.status !== 'approved') {
        return {
          success: false,
          message: riderApp.status === 'pending'
            ? 'Your rider application is still pending admin approval.'
            : 'Your rider application was not approved.'
        };
      }
      // Rider login - use their email as identifier, they don't have a password in localStorage
      // So we match by email only (simplified - in production use proper auth)
      const riderUser = {
        id: riderApp.id,
        name: riderApp.fullName,
        email: riderApp.email,
        role: 'rider'
      };
      localStorage.setItem("authUser", JSON.stringify(riderUser));
      setUser(riderUser);
      setRole('rider');
      setIsAuthenticated(true);
      return { success: true, role: 'rider' };
    }

    return { success: false, message: "Invalid username/email or password" };
  };

  // REGISTER - includes username
  const register = ({ name, username, email, password }) => {
    const users = JSON.parse(localStorage.getItem("users")) || [];

    if (users.some(u => u.username === username)) {
      return { success: false, message: "Username already taken" };
    }
    if (users.some(u => u.email === email)) {
      return { success: false, message: "Email already exists" };
    }

    const newUser = {
      id: Date.now(),
      name,
      username,
      email,
      password,
      role: "user"
    };

    users.push(newUser);
    localStorage.setItem("users", JSON.stringify(users));
    return { success: true };
  };

  const logout = () => {
    localStorage.removeItem("authUser");
    setUser(null);
    setRole(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{
      user,
      role,
      isAuthenticated,
      login,
      register,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);