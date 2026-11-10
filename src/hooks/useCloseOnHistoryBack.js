import { useCallback, useEffect, useRef } from 'react';

/** Other layers ignore popstate from a programmatic history.back() cleanup. */
let suppressForeignPop = 0;

/**
 * Mobile/browser Back closes the open overlay instead of leaving the page/tab.
 * Pushes one history entry while open; call release() before programmatic close
 * (X / Confirm) so a following navigate() is not undone by a late history.back().
 */
export function useCloseOnHistoryBack(isOpen, onClose, layerKey = 'modal') {
  const onCloseRef = useRef(onClose);
  const pushedRef = useRef(false);
  const ignorePopRef = useRef(false);
  const armedRef = useRef(false);
  const layerKeyRef = useRef(layerKey);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    layerKeyRef.current = layerKey;
  }, [layerKey]);

  const release = useCallback(() => new Promise((resolve) => {
    if (!pushedRef.current || window.history.state?.dkLayer !== layerKeyRef.current) {
      pushedRef.current = false;
      resolve();
      return;
    }

    ignorePopRef.current = true;
    pushedRef.current = false;
    suppressForeignPop += 1;

    const onPop = () => {
      window.removeEventListener('popstate', onPop);
      ignorePopRef.current = false;
      resolve();
    };

    window.addEventListener('popstate', onPop);
    try {
      window.history.back();
    } catch {
      window.removeEventListener('popstate', onPop);
      ignorePopRef.current = false;
      if (suppressForeignPop > 0) suppressForeignPop -= 1;
      resolve();
    }
  }), []);

  useEffect(() => {
    if (!isOpen) return undefined;

    ignorePopRef.current = false;
    armedRef.current = false;
    try {
      window.history.pushState({ dkLayer: layerKey }, '');
      pushedRef.current = true;
    } catch {
      pushedRef.current = false;
    }

    // Ignore popstate storms from Strict Mode / sibling modal cleanups right after open
    const armTimer = window.setTimeout(() => {
      armedRef.current = true;
    }, 100);

    const onPopState = () => {
      if (suppressForeignPop > 0) {
        suppressForeignPop -= 1;
        return;
      }
      if (ignorePopRef.current) {
        ignorePopRef.current = false;
        pushedRef.current = false;
        return;
      }
      if (!armedRef.current) {
        // Re-trap so Back still works after the modal finishes opening
        try {
          window.history.pushState({ dkLayer: layerKey }, '');
          pushedRef.current = true;
        } catch { /* ignore */ }
        return;
      }
      pushedRef.current = false;
      onCloseRef.current?.();
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.clearTimeout(armTimer);
      window.removeEventListener('popstate', onPopState);
      if (
        pushedRef.current
        && window.history.state?.dkLayer === layerKey
      ) {
        pushedRef.current = false;
        ignorePopRef.current = true;
        suppressForeignPop += 1;
        try {
          window.history.back();
        } catch {
          ignorePopRef.current = false;
          if (suppressForeignPop > 0) suppressForeignPop -= 1;
        }
      }
    };
  }, [isOpen, layerKey]);

  return { release };
}

export default useCloseOnHistoryBack;
