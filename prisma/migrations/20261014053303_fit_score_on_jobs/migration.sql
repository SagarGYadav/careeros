
-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "fitRecommendation" TEXT,
ADD COLUMN     "fitScore" INTEGER,
ADD COLUMN     "sortScore" INTEGER;

-- CreateIndex
CREATE INDEX "jobs_userId_feedStatus_sortScore_idx" ON "jobs"("userId", "feedStatus", "sortScore");

-- Existing jobs sort by relevance until they are analysed.
UPDATE "jobs" SET "sortScore" = "quickScore";
