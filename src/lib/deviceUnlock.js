/** Remember last customer on this device for PIN-only unlock (app / phone). */

const KEY = 'dkmerch_device_unlock';

export function saveDeviceUnlock(user) {
  if (!user?._id || (user.role && user.role !== 'user')) return;
  try {
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
