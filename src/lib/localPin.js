/** Local PIN fallback when Convex `setUserPin` / `verifyLoginPin` are not deployed yet. */
import { hashPin, isPlainPin } from "./pinHash";

const keyFor = (userId) => `dkmerch_pin_${userId}`;
const lenKeyFor = (userId) => `dkmerch_pin_len_${userId}`;

export async function saveLocalPin(userId, pin) {
  // New PINs are always 6 digits; still accept 4–6 when migrating old local pins
  if (!userId || !/^\d{4,6}$/.test(pin)) return false;
  try {
    const hashed = await hashPin(pin);
    localStorage.setItem(keyFor(userId), hashed);
    localStorage.setItem(lenKeyFor(userId), String(pin.length));
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

/** How many digits the user set (4–6). Defaults to 6 when unknown. */
export function getLocalPinLength(userId) {
  if (!userId) return 6;
  try {
    const n = parseInt(localStorage.getItem(lenKeyFor(userId)) || "", 10);
    if (n >= 4 && n <= 6) return n;
  } catch { /* ignore */ }
  return 6;
}

export function hasLocalPin(userId) {
  const p = getLocalPin(userId);
  if (!p) return false;
  return isPlainPin(p) || /^[a-f0-9]{64}$/i.test(p);
}

export async function verifyLocalPin(userId, pin) {
  const stored = getLocalPin(userId);
  if (!stored || !/^\d{4,6}$/.test(pin)) return false;
  const expectedLen = getLocalPinLength(userId);
  // If we know the length, require an exact match (stops “any shorter PIN” auto-accept)
  if (localStorage.getItem(lenKeyFor(userId)) && pin.length !== expectedLen) return false;
  if (isPlainPin(stored)) {
    if (stored !== pin) return false;
    try {
      localStorage.setItem(keyFor(userId), await hashPin(pin));
      localStorage.setItem(lenKeyFor(userId), String(pin.length));
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
    localStorage.removeItem(lenKeyFor(userId));
  } catch {}
}

/** Try Convex setUserPin; fall back to localStorage. */
export async function savePinWithFallback(setUserPinMutation, userId, pin) {
  try {
    const result = await setUserPinMutation({ userId, pin });
    if (result?.success) {
      await saveLocalPin(userId, pin);
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

/** Try Convex verifyLoginPin; only fall back to local when Convex is unreachable. */
export async function verifyPinWithFallback(verifyLoginPinMutation, userId, pin) {
  try {
    const result = await verifyLoginPinMutation({ userId, pin });
    // Trust the server when it responds — never override an Incorrect PIN with local
    if (result?.success) return { success: true, source: "convex", result };
    return {
      success: false,
      message: result?.needsPinSetup
        ? "No PIN yet — tap Reset Password or use another account."
        : (result?.message || "Incorrect PIN."),
      needsPinSetup: result?.needsPinSetup,
    };
  } catch (err) {
    const msg = String(err?.message || err || "");
    const missingApi =
      msg.includes("Could not find") ||
      msg.includes("verifyLoginPin") ||
      msg.includes("Failed to fetch") ||
      msg.includes("NetworkError");
    if (!missingApi) {
      return { success: false, message: "Incorrect PIN." };
    }
    if (await verifyLocalPin(userId, pin)) {
      return { success: true, source: "local", result: { success: true } };
    }
    if (hasLocalPin(userId)) {
      return { success: false, message: "Incorrect PIN." };
    }
    return {
      success: false,
      message: "No PIN yet — tap Reset Password or use another account.",
      needsPinSetup: true,
    };
  }
}
