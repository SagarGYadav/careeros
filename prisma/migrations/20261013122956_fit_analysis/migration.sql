
-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "extractedAt" TIMESTAMP(3),
ADD COLUMN     "extraction" JSONB,
ADD COLUMN     "extractionMode" TEXT,
ADD COLUMN     "extractionModel" TEXT,
ADD COLUMN     "extractionPromptVersion" TEXT,
ADD COLUMN     "extractionSourceHash" TEXT,
ADD COLUMN     "injectionSuspected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "responsibilities" TEXT[];

-- CreateTable
CREATE TABLE "job_requirements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "reqId" TEXT NOT NULL,
    "skillId" TEXT,
    "text" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "importance" TEXT NOT NULL,
    "yearsRequired" DOUBLE PRECISION,
    "quote" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "job_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring_configs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "weights" JSONB NOT NULL,
    "thresholds" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scoring_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_analyses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "resumeVersionId" TEXT,
    "scoringConfigVersion" INTEGER NOT NULL,
    "scoreTotal" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,
    "recommendation" TEXT NOT NULL,
    "blockers" JSONB NOT NULL,
    "gains" JSONB NOT NULL,
    "salaryContext" JSONB,
    "report" JSONB,
    "validation" JSONB,
    "model" TEXT,
    "promptVersion" TEXT,
    "inputHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_requirements_userId_jobId_idx" ON "job_requirements"("userId", "jobId");

-- CreateIndex
CREATE INDEX "job_requirements_skillId_idx" ON "job_requirements"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "job_requirements_jobId_reqId_key" ON "job_requirements"("jobId", "reqId");

-- CreateIndex
CREATE INDEX "scoring_configs_userId_active_idx" ON "scoring_configs"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "scoring_configs_userId_version_key" ON "scoring_configs"("userId", "version");

-- CreateIndex
CREATE INDEX "job_analyses_userId_jobId_createdAt_idx" ON "job_analyses"("userId", "jobId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "job_analyses_userId_jobId_inputHash_key" ON "job_analyses"("userId", "jobId", "inputHash");

-- AddForeignKey
ALTER TABLE "job_requirements" ADD CONSTRAINT "job_requirements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_requirements" ADD CONSTRAINT "job_requirements_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_requirements" ADD CONSTRAINT "job_requirements_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_configs" ADD CONSTRAINT "scoring_configs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_analyses" ADD CONSTRAINT "job_analyses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_analyses" ADD CONSTRAINT "job_analyses_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_analyses" ADD CONSTRAINT "job_analyses_resumeVersionId_fkey" FOREIGN KEY ("resumeVersionId") REFERENCES "resume_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
