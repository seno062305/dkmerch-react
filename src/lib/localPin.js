/** Local PIN fallback when Convex `setUserPin` / `verifyLoginPin` are not deployed yet. */
import { hashPin, isPlainPin } from "./pinHash";

const keyFor = (userId) => `dkmerch_pin_${userId}`;

export async function saveLocalPin(userId, pin) {
  if (!userId || !/^\d{4,6}$/.test(pin)) return false;
  try {
    const hashed = await hashPin(pin);
    localStorage.setItem(keyFor(userId), hashed);
    return true;
  } catch {
    return false;
  }
}

export function getLocalPin(userId) {
  if (!userId) return null;
  try {
    return localStorage.getItem(keyFor(userId));
  } catch {
    return null;
  }
}

export function hasLocalPin(userId) {
  const p = getLocalPin(userId);
  if (!p) return false;
  return isPlainPin(p) || /^[a-f0-9]{64}$/i.test(p);
}

export async function verifyLocalPin(userId, pin) {
  const stored = getLocalPin(userId);
  if (!stored || !/^\d{4,6}$/.test(pin)) return false;
  if (isPlainPin(stored)) {
    if (stored !== pin) return false;
    // upgrade to hash
    try {
      localStorage.setItem(keyFor(userId), await hashPin(pin));
    } catch {}
    return true;
  }
  const hashed = await hashPin(pin);
  return stored === hashed;
}

export function clearLocalPin(userId) {
  if (!userId) return;
  try {
    localStorage.removeItem(keyFor(userId));
  } catch {}
}

/** Try Convex setUserPin; fall back to localStorage. */
export async function savePinWithFallback(setUserPinMutation, userId, pin) {
  try {
    const result = await setUserPinMutation({ userId, pin });
    if (result?.success) {
      await saveLocalPin(userId, pin); // keep local mirror (hashed)
      return { success: true, source: "convex", result };
    }
    if (await saveLocalPin(userId, pin)) {
      return { success: true, source: "local", warning: result?.message };
    }
    return { success: false, message: result?.message || "Failed to save PIN." };
  } catch (err) {
    if (await saveLocalPin(userId, pin)) {
      return {
        success: true,
        source: "local",
        warning: "Saved on this device.",
      };
    }
    const msg = String(err?.message || err || "");
    if (msg.includes("Could not find") || msg.includes("setUserPin")) {
      return {
        success: false,
        message: "Could not save PIN. Please try again.",
      };
    }
    return { success: false, message: "Could not save PIN. Please try again." };
  }
}

/** Try Convex verifyLoginPin; fall back to localStorage. */
export async function verifyPinWithFallback(verifyLoginPinMutation, userId, pin) {
  try {
    const result = await verifyLoginPinMutation({ userId, pin });
    if (result?.success) return { success: true, source: "convex", result };
    if (await verifyLocalPin(userId, pin)) {
      return { success: true, source: "local", result: { success: true } };
    }
    return {
      success: false,
      message: result?.needsPinSetup ? "No PIN yet — tap Reset PIN to create one." : (result?.message || "Incorrect PIN."),
      needsPinSetup: result?.needsPinSetup,
    };
  } catch {
    if (await verifyLocalPin(userId, pin)) {
      return { success: true, source: "local", result: { success: true } };
    }
    if (hasLocalPin(userId)) {
      return { success: false, message: "Incorrect PIN." };
    }
    return {
      success: false,
      message: "No PIN yet — tap Reset PIN to create one.",
      needsPinSetup: true,
    };
  }
}
