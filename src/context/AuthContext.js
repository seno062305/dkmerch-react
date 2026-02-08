import React, { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

const BUILT_IN_ADMIN = {
  id: 0,
  name: "Administrator",
  username: "admin", // ✅ ADDED USERNAME
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
      localStorage.setItem(
        "users",
        JSON.stringify([BUILT_IN_ADMIN, ...users])
      );
    }
  }, []);

  // Load logged in user on mount
  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("authUser"));
    if (storedUser) {
      setUser(storedUser);
      setRole(storedUser.role);
      setIsAuthenticated(true);
    }
  }, []);

  // ✅ FIXED LOGIN - ACCEPTS USERNAME OR EMAIL
  const login = (identifier, password) => {
    const users = JSON.parse(localStorage.getItem("users")) || [];
    
    // Find user by username OR email
    const foundUser = users.find(
      u => (u.username === identifier || u.email === identifier) && u.password === password
    );

    if (!foundUser) {
      return { success: false, message: "Invalid username/email or password" };
    }

    localStorage.setItem("authUser", JSON.stringify(foundUser));
    setUser(foundUser);
    setRole(foundUser.role);
    setIsAuthenticated(true);

    return { success: true, role: foundUser.role };
  };

  // ✅ FIXED REGISTER - INCLUDES USERNAME
  const register = ({ name, username, email, password }) => {
    const users = JSON.parse(localStorage.getItem("users")) || [];
    
    // Check if username already exists
    if (users.some(u => u.username === username)) {
      return { success: false, message: "Username already taken" };
    }
    
    // Check if email already exists
    if (users.some(u => u.email === email)) {
      return { success: false, message: "Email already exists" };
    }

    // Create new user
    const newUser = {
      id: Date.now(),
      name,
      username, // ✅ STORE USERNAME
      email,
      password,
      role: "user"
    };

    // Add to users array
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