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

export default crons;