// authService.js
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "firebase/auth";
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

/**
 * Register a new user with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {string} name - User display name
 * @param {object} additionalData - Additional user data
 * @returns {Promise<object>} - User data with success status
 */
export const registerUser = async (email, password, name, additionalData = {}) => {
  try {
    // Create user in Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Update display name
    await updateProfile(user, { displayName: name });

    // Create user document in Firestore
    const userData = {
      uid: user.uid,
      email: email.toLowerCase(),
      name: name,
      role: "user", // Default role
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...additionalData
    };

    await setDoc(doc(db, "users", user.uid), userData);

    return {
      success: true,
      user: {
        uid: user.uid,
        email: user.email,
        name: name,
        role: "user"
      },
      message: "Registration successful!"
    };
  } catch (error) {
    console.error("Registration error:", error);
    
    let message = "Registration failed. Please try again.";
    
    if (error.code === "auth/email-already-in-use") {
      message = "This email is already registered.";
    } else if (error.code === "auth/weak-password") {
      message = "Password should be at least 6 characters.";
    } else if (error.code === "auth/invalid-email") {
      message = "Invalid email address.";
    }

    return {
      success: false,
      message: message,
      error: error.code
    };
  }
};

/**
 * Login user with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<object>} - User data with success status and role
 */
export const loginUser = async (email, password) => {
  try {
    // Sign in with Firebase Authentication
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Get user data from Firestore
    const userDoc = await getDoc(doc(db, "users", user.uid));
    
    if (!userDoc.exists()) {
      throw new Error("User data not found");
    }

    const userData = userDoc.data();

    // Update last login
    await updateDoc(doc(db, "users", user.uid), {
      lastLogin: serverTimestamp()
    });

    return {
      success: true,
      user: {
        uid: user.uid,
        email: user.email,
        name: userData.name || user.displayName,
        role: userData.role || "user"
      },
      role: userData.role || "user",
      message: "Login successful!"
    };
  } catch (error) {
    console.error("Login error:", error);
    
    let message = "Login failed. Please try again.";
    
    if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password") {
      message = "Invalid email or password.";
    } else if (error.code === "auth/invalid-credential") {
      message = "Invalid email or password.";
    } else if (error.code === "auth/too-many-requests") {
      message = "Too many failed attempts. Please try again later.";
    }

    return {
      success: false,
      message: message,
      error: error.code
    };
  }
};

/**
 * Logout current user
 * @returns {Promise<object>} - Success status
 */
export const logoutUser = async () => {
  try {
    await signOut(auth);
    return {
      success: true,
      message: "Logged out successfully!"
    };
  } catch (error) {
    console.error("Logout error:", error);
    return {
      success: false,
      message: "Logout failed. Please try again.",
      error: error.code
    };
  }
};

/**
 * Send password reset email
 * @param {string} email - User email
 * @returns {Promise<object>} - Success status
 */
export const resetPassword = async (email) => {
  try {
    await sendPasswordResetEmail(auth, email);
    return {
      success: true,
      message: "Password reset email sent! Check your inbox."
    };
  } catch (error) {
    console.error("Password reset error:", error);
    
    let message = "Failed to send reset email.";
    
    if (error.code === "auth/user-not-found") {
      message = "No account found with this email.";
    } else if (error.code === "auth/invalid-email") {
      message = "Invalid email address.";
    }

    return {
      success: false,
      message: message,
      error: error.code
    };
  }
};

/**
 * Update user password
 * @param {string} currentPassword - Current password
 * @param {string} newPassword - New password
 * @returns {Promise<object>} - Success status
 */
export const changePassword = async (currentPassword, newPassword) => {
  try {
    const user = auth.currentUser;
    
    if (!user || !user.email) {
      throw new Error("No user logged in");
    }

    // Re-authenticate user
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);

    // Update password
    await updatePassword(user, newPassword);

    return {
      success: true,
      message: "Password updated successfully!"
    };
  } catch (error) {
    console.error("Password change error:", error);
    
    let message = "Failed to update password.";
    
    if (error.code === "auth/wrong-password") {
      message = "Current password is incorrect.";
    } else if (error.code === "auth/weak-password") {
      message = "New password should be at least 6 characters.";
    }

    return {
      success: false,
      message: message,
      error: error.code
    };
  }
};

/**
 * Get current user data from Firestore
 * @returns {Promise<object|null>} - User data or null
 */
export const getCurrentUserData = async () => {
  try {
    const user = auth.currentUser;
    
    if (!user) {
      return null;
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    
    if (!userDoc.exists()) {
      return null;
    }

    const userData = userDoc.data();

    return {
      uid: user.uid,
      email: user.email,
      name: userData.name || user.displayName,
      role: userData.role || "user",
      ...userData
    };
  } catch (error) {
    console.error("Error getting user data:", error);
    return null;
  }
};

/**
 * Update user profile
 * @param {object} updates - Profile updates
 * @returns {Promise<object>} - Success status
 */
export const updateUserProfile = async (updates) => {
  try {
    const user = auth.currentUser;
    
    if (!user) {
      throw new Error("No user logged in");
    }

    // Update display name in Auth if provided
    if (updates.name) {
      await updateProfile(user, { displayName: updates.name });
    }

    // Update Firestore document
    await updateDoc(doc(db, "users", user.uid), {
      ...updates,
      updatedAt: serverTimestamp()
    });

    return {
      success: true,
      message: "Profile updated successfully!"
    };
  } catch (error) {
    console.error("Profile update error:", error);
    return {
      success: false,
      message: "Failed to update profile.",
      error: error.code
    };
  }
};

/**
 * Check if user has admin role
 * @param {string} uid - User ID
 * @returns {Promise<boolean>} - True if admin
 */
export const isAdmin = async (uid) => {
  try {
    const userDoc = await getDoc(doc(db, "users", uid));
    
    if (!userDoc.exists()) {
      return false;
    }

    const userData = userDoc.data();
    return userData.role === "admin";
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
};