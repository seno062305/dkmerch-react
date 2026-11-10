/**
 * Freeze page scroll WITHOUT jumping to the top.
 *
 * Important: do NOT use position:fixed + top:-Y here. That resets window.scrollY
 * to 0 (looks like "back to header"), then unlock scrollTo(y) looks like
 * "scrolls down on close". We only toggle overflow and pin the current Y.
 */
let lockCount = 0;
let lockedScrollY = 0;
let pinListening = false;

function readScrollY() {
  return (
    window.scrollY
    || window.pageYOffset
    || document.documentElement.scrollTop
    || document.body.scrollTop
    || 0
  );
}

function writeScrollY(y) {
  const top = Math.max(0, Number(y) || 0);
  const html = document.documentElement;
  const { body } = document;
  html.scrollTop = top;
  body.scrollTop = top;
  try {
    window.scrollTo({ top, left: 0, behavior: 'instant' });
  } catch {
    try { window.scrollTo(0, top); } catch { /* ignore */ }
  }
}

function pinScroll() {
  if (lockCount <= 0) return;
  if (readScrollY() !== lockedScrollY) writeScrollY(lockedScrollY);
}

function onWheelPin(e) {
  if (lockCount <= 0) return;
  // Allow wheel/touch scroll inside the modal itself
  const t = e.target;
  if (t && typeof t.closest === 'function') {
    if (t.closest(
      '#dk-overlay-root, .pin-unlock-screen, .product-modal-overlay, .modal-overlay, .dk-confirm-overlay, .rm-overlay, .iam-overlay, .rider-modal-overlay, .wb-scan-overlay, .refund-modal-overlay, .tracking-modal-overlay, .cart-modal-overlay, .login-modal-overlay, .register-modal-overlay, .order-modal-overlay, .pm-overlay, .stat-modal-overlay, .smodal-overlay, .lo-modal-overlay, .ar-bell-dropdown, .dk-chat-panel, .dk-chat-window, .dk-chat-backdrop, .dk-chat-fab-stack, .fullscreen-map-overlay'
    )) {
      return;
    }
  }
  e.preventDefault();
}

function startPinListeners() {
  if (pinListening || typeof window === 'undefined') return;
  pinListening = true;
  window.addEventListener('scroll', pinScroll, { passive: true, capture: true });
  window.addEventListener('wheel', onWheelPin, { passive: false, capture: true });
  window.addEventListener('touchmove', onWheelPin, { passive: false, capture: true });
}

function stopPinListeners() {
  if (!pinListening || typeof window === 'undefined') return;
  pinListening = false;
  window.removeEventListener('scroll', pinScroll, { capture: true });
  window.removeEventListener('wheel', onWheelPin, { capture: true });
  window.removeEventListener('touchmove', onWheelPin, { capture: true });
}

export function getOverlayRoot() {
  if (typeof document === 'undefined') return null;
  let el = document.getElementById('dk-overlay-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'dk-overlay-root';
    document.documentElement.appendChild(el);
  }
  return el;
}

export function getScrollLockCount() {
  return lockCount;
}

export function isScrollLocked() {
  return lockCount > 0;
}

export function lockBodyScroll() {
  if (typeof document === 'undefined') return;

  if (lockCount === 0) {
    lockedScrollY = readScrollY();
    const { body, documentElement: html } = document;

    body.classList.add('dk-scroll-locked');
    html.classList.add('dk-scroll-locked');

    // Keep current scroll — only stop further scrolling
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overscrollBehavior = 'none';

    if ('scrollRestoration' in window.history) {
      body.dataset.dkPrevScrollRestoration = window.history.scrollRestoration || 'auto';
      window.history.scrollRestoration = 'manual';
    }

    // Re-assert Y in case anything already nudged scroll this frame
    writeScrollY(lockedScrollY);
    startPinListeners();
  }

  lockCount += 1;
}

function clearLockStyles() {
  const { body, documentElement: html } = document;

  body.classList.remove('dk-scroll-locked');
  html.classList.remove('dk-scroll-locked');

  html.style.overflow = '';
  body.style.overflow = '';
  html.style.overscrollBehavior = '';
  body.style.overscrollBehavior = '';

  // Wipe any leftover position:fixed freeze from older lock attempts / App safety
  body.style.position = '';
  body.style.top = '';
  body.style.left = '';
  body.style.right = '';
  body.style.width = '';

  const root = document.getElementById('root');
  if (root) {
    root.classList.remove('dk-scroll-locked');
    root.style.position = '';
    root.style.top = '';
    root.style.left = '';
    root.style.right = '';
    root.style.width = '';
    root.style.overflow = '';
  }

  if ('scrollRestoration' in window.history && body.dataset.dkPrevScrollRestoration) {
    window.history.scrollRestoration = body.dataset.dkPrevScrollRestoration;
    delete body.dataset.dkPrevScrollRestoration;
  }
}

export function unlockBodyScroll() {
  if (typeof document === 'undefined') return;

  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0) return;

  const y = lockedScrollY;
  stopPinListeners();
  clearLockStyles();
  writeScrollY(y);
}

/** Drop all nested locks and keep current/saved scroll (nav / route changes). */
export function forceUnlockBodyScroll() {
  if (typeof document === 'undefined') return;
  const y = lockedScrollY;
  lockCount = 0;
  stopPinListeners();
  clearLockStyles();
  writeScrollY(y);
}

/** App safety: clear stray inline styles only when nothing holds the lock. */
export function clearScrollLockIfIdle() {
  if (typeof document === 'undefined') return;
  if (lockCount > 0) return;
  stopPinListeners();
  clearLockStyles();
}
