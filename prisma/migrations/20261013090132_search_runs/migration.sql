-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "notFitReasons" TEXT[];

-- CreateTable
CREATE TABLE "job_search_runs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'standard',
    "targetRoleIds" TEXT[],
    "plan" JSONB NOT NULL,
    "state" JSONB NOT NULL,
    "requestsByProvider" JSONB NOT NULL DEFAULT '{}',
    "pagesFetched" INTEGER NOT NULL DEFAULT 0,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "newCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'running',
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_search_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_search_runs_userId_createdAt_idx" ON "job_search_runs"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "job_search_runs" ADD CONSTRAINT "job_search_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
