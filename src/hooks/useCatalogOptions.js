import { useCallback, useEffect, useState } from 'react';
import { useConvex } from 'convex/react';
import { api } from '../../convex/_generated/api';

const FALLBACK_CATEGORIES = [
  { value: 'albums', label: 'Albums' },
  { value: 'photocards', label: 'Photocards' },
  { value: 'lightsticks', label: 'Lightsticks' },
  { value: 'accessories', label: 'Accessories' },
  { value: 'apparel', label: 'Apparel' },
];

const FALLBACK_GROUPS = [
  'BTS', 'BLACKPINK', 'TWICE', 'SEVENTEEN',
  'STRAY KIDS', 'EXO', 'RED VELVET', 'NEWJEANS',
].map((g) => ({ value: g, label: g }));

/**
 * Safe catalog loader — falls back to defaults if Convex function is unavailable.
 * Avoids crashing the app with "Could not find public function".
 */
export function useCatalogOptions(type) {
  const convex = useConvex();
  const fallback = type === 'kpopGroup' ? FALLBACK_GROUPS : FALLBACK_CATEGORIES;
  const [items, setItems] = useState(fallback);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await convex.query(api.catalogOptions.list, { type });
      if (Array.isArray(data) && data.length) setItems(data);
      else setItems(fallback);
    } catch {
      setItems(fallback);
    } finally {
      setReady(true);
    }
  }, [convex, type, fallback]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await convex.query(api.catalogOptions.list, { type });
        if (!alive) return;
        if (Array.isArray(data) && data.length) setItems(data);
        else setItems(fallback);
      } catch {
        if (alive) setItems(fallback);
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, [convex, type]); // eslint-disable-line react-hooks/exhaustive-deps

  return { items, ready, refresh, fallback };
}

export { FALLBACK_CATEGORIES, FALLBACK_GROUPS };
