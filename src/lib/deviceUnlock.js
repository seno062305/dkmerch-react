/** Remember last customer/admin on this device for PIN-only unlock (app / phone). */

const KEY = 'dkmerch_device_unlock';
/** Set on explicit logout so cold start never shows PIN for the previous user. */
const LOGGED_OUT_KEY = 'dkmerch_explicit_logout';

function canSaveRole(role) {
  return !role || role === 'user' || role === 'admin';
}

export function saveDeviceUnlock(user) {
  if (!user?._id || !canSaveRole(user.role)) return;
  try {
    localStorage.removeItem(LOGGED_OUT_KEY);
    localStorage.setItem(
      KEY,
      JSON.stringify({
        _id: user._id,
        id: user._id,
        name: user.name || '',
        username: user.username || '',
        email: user.email || '',
        phone: user.phone || '',
        role: user.role === 'admin' ? 'admin' : 'user',
        savedAt: Date.now(),
      })
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function getDeviceUnlock() {
  try {
    if (localStorage.getItem(LOGGED_OUT_KEY) === '1') return null;
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw?._id) return null;
    if (raw.role && !canSaveRole(raw.role)) return null;
    return raw;
  } catch {
    return null;
  }
}

export function clearDeviceUnlock() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function markExplicitLogout() {
  try {
    localStorage.removeItem(KEY);
    localStorage.setItem(LOGGED_OUT_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function clearExplicitLogoutFlag() {
  try {
    localStorage.removeItem(LOGGED_OUT_KEY);
  } catch {
    /* ignore */
  }
}
