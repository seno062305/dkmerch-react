/** Session keys for in-progress PayMongo checkout (leave / back confirmation). */
export const PAY_HOLD_KEY = 'dk_pay_hold_active';
export const PAY_LINK_KEY = 'dk_pay_checkout_url';
export const PAY_ORDER_KEY = 'dk_post_payment_order';
export const PAY_HOME_KEY = 'dk_post_payment_home';
export const PAY_ROLE_KEY = 'dk_post_payment_role';
/** Where to send the user after they choose Leave on /paying */
export const PAY_RETURN_KEY = 'dk_post_payment_return';

export function readPaySession() {
  try {
    return {
      orderId: sessionStorage.getItem(PAY_HOLD_KEY) || sessionStorage.getItem(PAY_ORDER_KEY) || '',
      checkoutUrl: sessionStorage.getItem(PAY_LINK_KEY) || '',
      home: sessionStorage.getItem(PAY_HOME_KEY) || '/',
      role: sessionStorage.getItem(PAY_ROLE_KEY) || 'user',
    };
  } catch {
    return { orderId: '', checkoutUrl: '', home: '/', role: 'user' };
  }
}

export function markPayInProgress({ orderId, checkoutUrl, home, role }) {
  try {
    if (orderId) {
      sessionStorage.setItem(PAY_HOLD_KEY, String(orderId));
      sessionStorage.setItem(PAY_ORDER_KEY, String(orderId));
    }
    if (checkoutUrl) sessionStorage.setItem(PAY_LINK_KEY, String(checkoutUrl));
    if (home) sessionStorage.setItem(PAY_HOME_KEY, String(home));
    if (role) sessionStorage.setItem(PAY_ROLE_KEY, String(role));
  } catch { /* ignore */ }
}

export function clearPaySession() {
  try {
    sessionStorage.removeItem(PAY_HOLD_KEY);
    sessionStorage.removeItem(PAY_LINK_KEY);
    // keep post_payment_order briefly for track links; clear hold marker only
  } catch { /* ignore */ }
  try {
    sessionStorage.removeItem(PAY_HOLD_KEY);
    sessionStorage.removeItem(PAY_LINK_KEY);
  } catch { /* ignore */ }
}

export function clearPaySessionAll() {
  try {
    sessionStorage.removeItem(PAY_HOLD_KEY);
    sessionStorage.removeItem(PAY_LINK_KEY);
    sessionStorage.removeItem(PAY_ORDER_KEY);
    sessionStorage.removeItem(PAY_HOME_KEY);
    sessionStorage.removeItem(PAY_ROLE_KEY);
    sessionStorage.removeItem(PAY_RETURN_KEY);
  } catch { /* ignore */ }
}

export function roleHome(role, storedHome) {
  if (storedHome === '/admin' || storedHome === '/rider' || storedHome === '/') return storedHome;
  if (role === 'admin') return '/admin';
  if (role === 'rider') return '/rider';
  return '/';
}

/**
 * Open PayMongo after planting `/paying` in history.
 * Browser Back hits `/paying`, which immediately returns the user to PayMongo
 * (browsers cannot show our UI on top of checkout.paymongo.com).
 * To leave payment, use PayMongo Cancel / Back to merchant.
 */
export function goToPayMongo(checkoutUrl, returnPath) {
  if (!checkoutUrl) return;
  try {
    const orderId =
      sessionStorage.getItem(PAY_HOLD_KEY) ||
      sessionStorage.getItem(PAY_ORDER_KEY) ||
      '';
    if (returnPath) {
      sessionStorage.setItem(PAY_RETURN_KEY, String(returnPath));
    }
    const bridge = new URL('/paying', window.location.origin);
    if (orderId) bridge.searchParams.set('orderId', orderId);
    window.history.pushState({ dkPaying: true }, '', `${bridge.pathname}${bridge.search}`);
  } catch { /* ignore */ }
  window.location.assign(checkoutUrl);
}
