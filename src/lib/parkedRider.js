/** Park rider session while browsing the customer shop (no server logout). */

const KEY = 'dkmerch_parked_rider';
const BROWSING_KEY = 'dkmerch_rider_browsing_shop';

export function parkRiderSession(user) {
  if (!user || user.role !== 'rider' || !user.email) return false;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        _id: user._id,
        id: user._id || user.id,
        name: user.name || '',
        email: String(user.email).toLowerCase(),
        role: 'rider',
        sessionId: user.sessionId ? String(user.sessionId) : undefined,
        parkedAt: Date.now(),
      })
    );
    localStorage.setItem(BROWSING_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

export function getParkedRider() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw?.email || raw.role !== 'rider') return null;
    return raw;
  } catch {
    return null;
  }
}

export function clearParkedRider() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(BROWSING_KEY);
  } catch { /* ignore */ }
}

export function isRiderBrowsingShop() {
  try {
    return localStorage.getItem(BROWSING_KEY) === '1' && !!getParkedRider();
  } catch {
    return false;
  }
}

export function clearRiderBrowsingFlag() {
  try {
    localStorage.removeItem(BROWSING_KEY);
  } catch { /* ignore */ }
}
