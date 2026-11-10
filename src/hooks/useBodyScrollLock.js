import { useLayoutEffect } from 'react';
import { lockBodyScroll, unlockBodyScroll } from '../utils/scrollLock';

/** Freeze page scroll at the current position while `active` is true (before paint). */
export default function useBodyScrollLock(active = true) {
  useLayoutEffect(() => {
    if (!active) return undefined;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [active]);
}
