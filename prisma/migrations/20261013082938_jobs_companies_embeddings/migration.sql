-- AlterTable
ALTER TABLE "career_profiles" ADD COLUMN     "embedding" vector(384),
ADD COLUMN     "embeddingModel" TEXT,
ADD COLUMN     "embeddingSourceHash" TEXT;

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "aliases" TEXT[],
    "website" TEXT,
    "careersUrl" TEXT,
    "isStaffingAgency" BOOLEAN NOT NULL DEFAULT false,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT,
    "companyName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "roleFamilyId" TEXT,
    "targetRoleIds" TEXT[],
    "seniority" TEXT,
    "location" TEXT,
    "locationCity" TEXT,
    "workMode" TEXT,
    "employmentType" TEXT,
    "salaryMinAnnual" INTEGER,
    "salaryMaxAnnual" INTEGER,
    "salaryCurrency" TEXT,
    "salaryText" TEXT,
    "salaryDisclosed" BOOLEAN NOT NULL DEFAULT false,
    "expMinYears" DOUBLE PRECISION,
    "expMaxYears" DOUBLE PRECISION,
    "descriptionRaw" TEXT NOT NULL,
    "descriptionHash" TEXT NOT NULL,
    "descriptionTruncated" BOOLEAN NOT NULL DEFAULT false,
    "origin" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "postedVia" TEXT,
    "isDirectFromCompany" BOOLEAN NOT NULL DEFAULT false,
    "applyLinks" JSONB NOT NULL,
    "postedAt" TIMESTAMP(3),
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "feedStatus" TEXT NOT NULL DEFAULT 'new',
    "dismissReason" TEXT,
    "quickScore" INTEGER,
    "scoreParts" JSONB,
    "searchRunId" TEXT,
    "conditions" JSONB,
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "embedding" vector(384),
    "embeddingModel" TEXT,
    "embeddedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_userId_normalizedName_key" ON "companies"("userId", "normalizedName");

-- CreateIndex
CREATE INDEX "jobs_userId_feedStatus_quickScore_idx" ON "jobs"("userId", "feedStatus", "quickScore");

-- CreateIndex
CREATE INDEX "jobs_userId_descriptionHash_idx" ON "jobs"("userId", "descriptionHash");

-- CreateIndex
CREATE INDEX "jobs_userId_companyId_idx" ON "jobs"("userId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_userId_provider_externalId_key" ON "jobs"("userId", "provider", "externalId");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Approximate nearest-neighbour search on job vectors (cosine). Prisma cannot describe HNSW indexes.
CREATE INDEX "jobs_embedding_hnsw" ON "jobs" USING hnsw ("embedding" vector_cosine_ops);
