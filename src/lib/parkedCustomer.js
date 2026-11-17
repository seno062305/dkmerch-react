/** Park customer session while rider app is active (no server logout). */

const KEY = 'dkmerch_parked_customer';

export function parkCustomerSession(user) {
  if (!user?._id) return false;
  const role = user.role || 'user';
  if (role !== 'user' && role !== 'admin') return false;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        _id: user._id,
        id: user._id || user.id,
        name: user.name || '',
        username: user.username || '',
        email: String(user.email || '').toLowerCase(),
        phone: user.phone || '',
        role: role === 'admin' ? 'admin' : 'user',
        sessionId: user.sessionId ? String(user.sessionId) : undefined,
        parkedAt: Date.now(),
      })
    );
    return true;
  } catch {
    return false;
  }
}

export function getParkedCustomer() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw?._id) return null;
    if (raw.role && raw.role !== 'user' && raw.role !== 'admin') return null;
    return raw;
  } catch {
    return null;
  }
}

export function clearParkedCustomer() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}
