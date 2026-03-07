// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// ✅ Bawat 1 minuto, i-check kung may pre-order na nag-release na
crons.interval(
  "check and release pre-orders",
  { minutes: 1 },
  internal.preOrderRequests.checkAndReleasePreOrders
);

// ✅ Bawat 6 oras, i-delete ang mga expired pending registrations
// (users na nag-register pero hindi nag-verify ng email within 24 hours)
crons.interval(
  "cleanup expired pending users",
  { hours: 6 },
  internal.users.cleanupExpiredPendingUsers,
  {}
);

export default crons;