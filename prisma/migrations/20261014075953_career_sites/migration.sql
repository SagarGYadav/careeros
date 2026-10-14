
-- CreateTable
CREATE TABLE "career_sites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "boardToken" TEXT,
    "url" TEXT,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "discoveredFrom" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3),
    "lastJobCount" INTEGER NOT NULL DEFAULT 0,
    "relevantJobCount" INTEGER NOT NULL DEFAULT 0,
    "emptyRuns" INTEGER NOT NULL DEFAULT 0,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "career_sites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "career_sites_userId_status_nextCheckAt_idx" ON "career_sites"("userId", "status", "nextCheckAt");

-- CreateIndex
CREATE UNIQUE INDEX "career_sites_userId_key_key" ON "career_sites"("userId", "key");

-- AddForeignKey
ALTER TABLE "career_sites" ADD CONSTRAINT "career_sites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_sites" ADD CONSTRAINT "career_sites_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
