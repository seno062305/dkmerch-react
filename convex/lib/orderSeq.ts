/** Shared sequential order-number allocation (Convex OCC on a single counter doc). */

export const MAX_REASONABLE_SEQ = 999_999;

export function isReasonableSeq(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 1 && n <= MAX_REASONABLE_SEQ;
}

export function seqFromOrderId(orderId: unknown): number {
  const m = String(orderId || "").match(/^DK-(\d{1,6})-([A-Z0-9]+)$/i);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  return isReasonableSeq(n) ? n : 0;
}

export function buildOrderId(seq: number): string {
  const suffix = Math.random().toString(36).substring(2, 8).toUpperCase().padEnd(6, "X");
  return `DK-${String(seq).padStart(4, "0")}-${suffix}`;
}

async function maxExistingOrderSeq(db: any): Promise<number> {
  let max = 0;
  const top = await db.query("orders").withIndex("by_orderSeq").order("desc").first();
  if (top && isReasonableSeq(top.orderSeq)) max = Math.max(max, top.orderSeq);

  const recent = await db.query("orders").order("desc").take(200);
  for (const o of recent) {
    if (isReasonableSeq(o.orderSeq)) max = Math.max(max, o.orderSeq);
    max = Math.max(max, seqFromOrderId(o.orderId));
  }
  return max;
}

/**
 * Allocate the next store-wide order number.
 * Relies on Convex OCC: concurrent patches to the same counter doc retry automatically.
 * Bootstrap insert is only safe once — call ensureOrderCounterSeeded before traffic if needed.
 */
export async function allocateOrderSeq(db: any): Promise<number> {
  const floor = await maxExistingOrderSeq(db);

  let counters = await db
    .query("orderCounters")
    .withIndex("by_name", (q: any) => q.eq("name", "orders"))
    .collect();

  if (counters.length === 0) {
    await db.insert("orderCounters", { name: "orders", nextSeq: floor + 1 });
    counters = await db
      .query("orderCounters")
      .withIndex("by_name", (q: any) => q.eq("name", "orders"))
      .collect();
  }

  // Oldest counter is canonical so concurrent txs that see the same set pick the same doc
  counters.sort((a: any, b: any) => a._creationTime - b._creationTime);
  const primary = counters[0];

  const seq = Math.max(Number(primary.nextSeq) || 1, floor + 1);
  await db.patch(primary._id, { nextSeq: seq + 1 });

  for (let i = 1; i < counters.length; i++) {
    await db.delete(counters[i]._id);
  }

  return seq;
}

/** Ensure one counter exists (run once after deploy / before load tests). */
export async function ensureOrderCounterSeeded(db: any): Promise<{ nextSeq: number; created: boolean }> {
  const existing = await db
    .query("orderCounters")
    .withIndex("by_name", (q: any) => q.eq("name", "orders"))
    .collect();

  if (existing.length > 0) {
    existing.sort((a: any, b: any) => a._creationTime - b._creationTime);
    const primary = existing[0];
    const floor = await maxExistingOrderSeq(db);
    const nextSeq = Math.max(Number(primary.nextSeq) || 1, floor + 1);
    if (nextSeq !== Number(primary.nextSeq)) {
      await db.patch(primary._id, { nextSeq });
    }
    for (let i = 1; i < existing.length; i++) {
      await db.delete(existing[i]._id);
    }
    return { nextSeq, created: false };
  }

  const floor = await maxExistingOrderSeq(db);
  const nextSeq = floor + 1;
  await db.insert("orderCounters", { name: "orders", nextSeq });
  return { nextSeq, created: true };
}

/**
 * Reassign unique orderSeq by creation time (keeps orderId stable for payment/track links).
 * Display uses orderSeq + suffix from orderId.
 */
export async function repairDuplicateOrderSeqs(db: any): Promise<{ updated: number; nextSeq: number }> {
  const orders = await db.query("orders").collect();
  orders.sort((a: any, b: any) => a._creationTime - b._creationTime);

  let next = 1;
  let updated = 0;
  for (const o of orders) {
    if (o.orderSeq !== next) {
      await db.patch(o._id, { orderSeq: next });
      updated++;
    }
    next++;
  }

  const counters = await db
    .query("orderCounters")
    .withIndex("by_name", (q: any) => q.eq("name", "orders"))
    .collect();
  counters.sort((a: any, b: any) => a._creationTime - b._creationTime);

  if (counters.length === 0) {
    await db.insert("orderCounters", { name: "orders", nextSeq: next });
  } else {
    await db.patch(counters[0]._id, { nextSeq: next });
    for (let i = 1; i < counters.length; i++) {
      await db.delete(counters[i]._id);
    }
  }

  return { updated, nextSeq: next };
}
