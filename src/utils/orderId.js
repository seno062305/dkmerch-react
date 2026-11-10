/**
 * Display helper for order IDs — same look as before (`#5-HX1DGW`).
 * Number comes from unique orderSeq (not a timestamp).
 *
 * Stored: DK-000012-ABCDEF
 * Shown:  12-ABCDEF
 */

const MAX_REASONABLE_SEQ = 999999;

function extractSuffix(id) {
  const dk = String(id || "").match(/^DK-\d+-([A-Z0-9]+)$/i);
  if (dk?.[1]) return dk[1].toUpperCase();
  const tail = String(id || "").match(/-([A-Z0-9]{4,10})$/i);
  if (tail?.[1]) return tail[1].toUpperCase();
  return "";
}

export function formatOrderShortId(orderOrId) {
  const order = orderOrId && typeof orderOrId === "object" ? orderOrId : null;
  const id = String(order?.orderId ?? orderOrId ?? "").trim();
  const suffix = extractSuffix(id);

  // Prefer server orderSeq when it is a real short sequence (not Date.now())
  const fromField = order?.orderSeq != null ? Number(order.orderSeq) : NaN;
  if (Number.isFinite(fromField) && fromField >= 1 && fromField <= MAX_REASONABLE_SEQ) {
    const seq = Math.trunc(fromField);
    return suffix ? `${seq}-${suffix}` : String(seq);
  }

  // New sequential stored id: DK-000012-ABCDEF → 12-ABCDEF
  const sequential = id.match(/^DK-(\d+)-([A-Z0-9]+)$/i);
  if (sequential) {
    const seq = parseInt(sequential[1], 10);
    if (Number.isFinite(seq) && seq >= 1 && seq <= MAX_REASONABLE_SEQ) {
      return `${seq}-${sequential[2].toUpperCase()}`;
    }
    // Timestamp wrongly baked into DK-… — show short suffix only style
    if (suffix) return suffix;
  }

  // Legacy / failover timestamp ids — keep old last-8 display
  if (!id) return "N/A";
  return id.slice(-8).toUpperCase();
}

export function formatOrderLabel(orderOrId) {
  return `#${formatOrderShortId(orderOrId)}`;
}
