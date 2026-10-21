-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedReason" TEXT,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing jobs were last seen when they were found (the new column would otherwise say "now").
UPDATE "jobs" SET "lastSeenAt" = "discoveredAt";
