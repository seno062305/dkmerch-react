/** Remember last customer/admin/rider on this device for PIN-only unlock (app / phone). */

const KEY = 'dkmerch_device_unlock';
const RIDER_KEY = 'dkmerch_rider_device_unlock';
/** Set on explicit logout so cold start never shows PIN for the previous user. */
const LOGGED_OUT_KEY = 'dkmerch_explicit_logout';
const RIDER_LOGGED_OUT_KEY = 'dkmerch_rider_explicit_logout';

function canSaveCustomerRole(role) {
  return !role || role === 'user' || role === 'admin';
}

export function saveDeviceUnlock(user) {
  if (!user?._id) return;
  try {
    if (user.role === 'rider') {
      localStorage.removeItem(RIDER_LOGGED_OUT_KEY);
      localStorage.setItem(
        RIDER_KEY,
        JSON.stringify({
          _id: user._id,
          id: user._id,
          name: user.name || '',
          email: user.email || '',
          phone: user.phone || '',
          role: 'rider',
          ...(user.sessionId ? { sessionId: String(user.sessionId) } : {}),
          savedAt: Date.now(),
        })
      );
      return;
    }
    if (!canSaveCustomerRole(user.role)) return;
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
        ...(user.sessionId ? { sessionId: String(user.sessionId) } : {}),
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
    if (raw.role && !canSaveCustomerRole(raw.role)) return null;
    return raw;
  } catch {
    return null;
  }
}

/** Rider unlock profile only (for rider PIN gate). */
export function getRiderDeviceUnlock() {
  try {
    if (localStorage.getItem(RIDER_LOGGED_OUT_KEY) === '1') return null;
    const raw = JSON.parse(localStorage.getItem(RIDER_KEY) || 'null');
    if (!raw?._id || raw.role !== 'rider') return null;
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

export function clearRiderDeviceUnlock() {
  try {
    localStorage.removeItem(RIDER_KEY);
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

export function markRiderExplicitLogout() {
  try {
    localStorage.removeItem(RIDER_KEY);
    localStorage.setItem(RIDER_LOGGED_OUT_KEY, '1');
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

export function clearRiderExplicitLogoutFlag() {
  try {
    localStorage.removeItem(RIDER_LOGGED_OUT_KEY);
  } catch {
    /* ignore */
  }
}
