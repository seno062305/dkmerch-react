/**
 * Display helper for order IDs — same look as before (`#5-HX1DGW`),
 * but the number is a unique sequential orderSeq (not a timestamp digit).
 *
 * Stored: DK-000012-ABCDEF
 * Shown:  12-ABCDEF
 */

export function formatOrderShortId(orderOrId) {
  const order = orderOrId && typeof orderOrId === 'object' ? orderOrId : null;
  const id = String(order?.orderId ?? orderOrId ?? '').trim();

  // New sequential: DK-000012-ABCDEF → 12-ABCDEF
  const sequential = id.match(/^DK-(\d+)-([A-Z0-9]+)$/i);
  if (sequential) {
    const seq = parseInt(sequential[1], 10);
    const suffix = sequential[2].toUpperCase();
    if (Number.isFinite(seq) && suffix) return `${seq}-${suffix}`;
  }

  // Object with orderSeq + parseable id
  if (order?.orderSeq != null && Number.isFinite(Number(order.orderSeq))) {
    const seq = Math.trunc(Number(order.orderSeq));
    const m = id.match(/^DK-\d+-([A-Z0-9]+)$/i);
    if (m?.[1]) return `${seq}-${m[1].toUpperCase()}`;
    return String(seq);
  }

  // Legacy / failover timestamp ids — keep old last-8 display
  if (!id) return 'N/A';
  return id.slice(-8).toUpperCase();
}

export function formatOrderLabel(orderOrId) {
  return `#${formatOrderShortId(orderOrId)}`;
}
