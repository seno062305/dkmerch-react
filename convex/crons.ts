import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Runs daily; handler decides daily vs weekly vs off from settings.
crons.daily(
  "dkmerch-auto-backup",
  { hourUTC: 17, minuteUTC: 0 },
  internal.backup.runAutoBackup
);

// Mirror Convex → Cloud Firestore every hour (backup / 2nd database).
crons.interval(
  "dkmerch-firebase-mirror",
  { hours: 1 },
  internal.firebaseSync.syncAllToFirebase
);

// Pull pending Firebase failover orders back into Convex every 5 minutes.
crons.interval(
  "dkmerch-failover-sync-back",
  { minutes: 5 },
  internal.failoverSync.syncFailoverOrdersToConvex
);

// Trim old GPS pings, logs, OTP pending rows so free Convex quota lasts longer.
crons.daily(
  "dkmerch-purge-old-ephemeral",
  { hourUTC: 18, minuteUTC: 30 },
  internal.adminCleanup.purgeOldEphemeral
);

export default crons;
