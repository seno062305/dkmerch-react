import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Runs daily; handler decides daily vs weekly vs off from settings.
crons.daily(
  "dkmerch-auto-backup",
  { hourUTC: 17, minuteUTC: 0 },
  internal.backup.runAutoBackup
);

export default crons;
