import { forceUnlockBodyScroll, clearScrollLockIfIdle } from './scrollLock';

/** Clear leftover modal/body scroll locks so page scroll works again. */
export function unlockBodyScroll() {
  forceUnlockBodyScroll();
  clearScrollLockIfIdle();
  try {
    document.body.classList.remove(
      'login-modal-open',
      'product-modal-open',
      'cart-modal-open'
    );
  } catch { /* ignore */ }
}

/** Jump to the top of the current page once (no scroll spam). */
export function scrollPageToTop({ smooth = false } = {}) {
  unlockBodyScroll();
  try {
    window.scrollTo({ top: 0, left: 0, behavior: smooth ? 'smooth' : 'auto' });
  } catch {
    try { window.scrollTo(0, 0); } catch { /* ignore */ }
  }
  try {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  } catch { /* ignore */ }
}

/**
 * Footer / bottom-nav: go straight to the route.
 * Same route → jump to top once. Different route → navigate (direct).
 */
export function goToCustomerTab(navigate, locationPath, to) {
  const path = String(to || '/');
  const here = String(locationPath || '');
  const sameTab =
    here === path
    || (path !== '/' && here.startsWith(`${path}/`));

  unlockBodyScroll();

  if (sameTab) {
    scrollPageToTop({ smooth: false });
    return;
  }

  navigate(path, { state: { scrollToTop: true } });
}
