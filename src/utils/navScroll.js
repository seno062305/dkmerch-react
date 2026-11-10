/** Clear leftover modal/body scroll locks so page scroll works again. */
export function unlockBodyScroll() {
  try {
    document.body.classList.remove(
      "login-modal-open",
      "product-modal-open",
      "cart-modal-open"
    );
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
  } catch { /* ignore */ }
}

/** Scroll window (and common app roots) to the top of the current page. */
export function scrollPageToTop({ smooth = true } = {}) {
  unlockBodyScroll();
  const behavior = smooth ? "smooth" : "auto";
  const go = () => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior });
    } catch {
      window.scrollTo(0, 0);
    }
    try {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    } catch { /* ignore */ }
    const roots = document.querySelectorAll(
      ".app-main, .main-content, [data-scroll-root], .legal-page, .collections-page, .preorder-page, .track-order-page"
    );
    roots.forEach((el) => {
      try { el.scrollTop = 0; } catch { /* ignore */ }
    });
  };
  go();
  requestAnimationFrame(go);
  setTimeout(go, 80);
  setTimeout(go, 220);
  setTimeout(go, 400);
}

/**
 * Footer / bottom-nav: go to the tab route, then scroll to that page top.
 * Same route → just scroll to top.
 */
export function goToCustomerTab(navigate, locationPath, to) {
  const path = String(to || "/");
  unlockBodyScroll();
  if (
    locationPath === path
    || (path !== "/" && String(locationPath || "").startsWith(`${path}/`))
  ) {
    scrollPageToTop({ smooth: true });
    return;
  }
  navigate(path, { state: { scrollToTop: true } });
  // After React paints the new route
  setTimeout(() => scrollPageToTop({ smooth: true }), 50);
  setTimeout(() => scrollPageToTop({ smooth: true }), 200);
  setTimeout(() => scrollPageToTop({ smooth: false }), 450);
}
