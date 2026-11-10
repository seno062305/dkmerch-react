/** Remember last customer on this device for PIN-only unlock (app / phone). */

const KEY = 'dkmerch_device_unlock';
/** Set on explicit logout so cold start never shows PIN for the previous user. */
const LOGGED_OUT_KEY = 'dkmerch_explicit_logout';

export function saveDeviceUnlock(user) {
  if (!user?._id || (user.role && user.role !== 'user')) return;
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
        role: 'user',
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
    if (raw.role && raw.role !== 'user') return null;
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
