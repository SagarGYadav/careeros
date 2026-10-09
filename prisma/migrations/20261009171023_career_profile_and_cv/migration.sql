-- CreateTable
CREATE TABLE "personal_details" (
    "userId" TEXT NOT NULL,
    "fullName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "linkedinUrl" TEXT,
    "githubUrl" TEXT,
    "portfolioUrl" TEXT,
    "otherLinks" TEXT[],
    "otherDetails" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_details_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "career_profiles" (
    "userId" TEXT NOT NULL,
    "headline" TEXT,
    "summary" TEXT,
    "yearsExperience" DOUBLE PRECISION,
    "currentCtc" INTEGER,
    "expectedCtcMin" INTEGER,
    "expectedCtcMax" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "noticePeriodDays" INTEGER,
    "preferredLocations" TEXT[],
    "workModes" TEXT[],
    "openToRelocate" BOOLEAN NOT NULL DEFAULT false,
    "dealbreakers" JSONB,
    "domains" TEXT[],
    "onboardingCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "career_profiles_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "role_families" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "titleVariants" TEXT[],
    "seniorityBands" JSONB NOT NULL,
    "adjacentSlugs" TEXT[],

    CONSTRAINT "role_families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_family_skills" (
    "roleFamilyId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,

    CONSTRAINT "role_family_skills_pkey" PRIMARY KEY ("roleFamilyId","skillId")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "ownerKey" TEXT NOT NULL DEFAULT 'global',
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "aliases" TEXT[],
    "learningEffort" INTEGER NOT NULL DEFAULT 2,
    "resources" JSONB,
    "unreviewed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_relations" (
    "fromSkillId" TEXT NOT NULL,
    "toSkillId" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "skill_relations_pkey" PRIMARY KEY ("fromSkillId","toSkillId")
);

-- CreateTable
CREATE TABLE "user_skills" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "proficiency" INTEGER NOT NULL,
    "proficiencySource" TEXT NOT NULL,
    "proficiencyReason" TEXT,
    "years" DOUBLE PRECISION,
    "lastUsedYear" INTEGER,
    "evidenceIds" TEXT[],
    "source" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_skill_history" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "proficiency" INTEGER NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_skill_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experience_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "employmentType" TEXT,
    "location" TEXT,
    "workMode" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "durationMonths" INTEGER,
    "domain" TEXT,
    "teamSize" TEXT,
    "summary" TEXT,
    "bullets" JSONB NOT NULL,
    "technologies" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "experience_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "description" TEXT,
    "technologies" TEXT[],
    "links" TEXT[],
    "startDate" TEXT,
    "endDate" TEXT,
    "bullets" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "education_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "degree" TEXT,
    "field" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "grade" TEXT,
    "location" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "education_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certification_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "issueDate" TEXT,
    "expiryDate" TEXT,
    "credentialId" TEXT,
    "url" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certification_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "other_cv_sections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "items" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "other_cv_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_facts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "career_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_versions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetRoleFamilyId" TEXT,
    "parentId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "fileId" TEXT,
    "extractedText" TEXT,
    "pageCount" INTEGER,
    "links" JSONB,
    "parsed" JSONB,
    "evidence" JSONB,
    "verification" JSONB,
    "parseStatus" TEXT NOT NULL DEFAULT 'uploaded',
    "parseMode" TEXT,
    "parseProvider" TEXT,
    "injectionSuspected" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resume_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_families_slug_key" ON "role_families"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "skills_ownerKey_slug_key" ON "skills"("ownerKey", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "user_skills_userId_skillId_key" ON "user_skills"("userId", "skillId");

-- CreateIndex
CREATE INDEX "user_skill_history_userId_skillId_changedAt_idx" ON "user_skill_history"("userId", "skillId", "changedAt");

-- CreateIndex
CREATE INDEX "experience_entries_userId_sortOrder_idx" ON "experience_entries"("userId", "sortOrder");

-- CreateIndex
CREATE INDEX "project_entries_userId_sortOrder_idx" ON "project_entries"("userId", "sortOrder");

-- CreateIndex
CREATE INDEX "education_entries_userId_sortOrder_idx" ON "education_entries"("userId", "sortOrder");

-- CreateIndex
CREATE INDEX "certification_entries_userId_sortOrder_idx" ON "certification_entries"("userId", "sortOrder");

-- CreateIndex
CREATE INDEX "other_cv_sections_userId_sortOrder_idx" ON "other_cv_sections"("userId", "sortOrder");

-- CreateIndex
CREATE INDEX "career_facts_userId_status_idx" ON "career_facts"("userId", "status");

-- CreateIndex
CREATE INDEX "stored_files_userId_sha256_idx" ON "stored_files"("userId", "sha256");

-- CreateIndex
CREATE INDEX "resume_versions_userId_createdAt_idx" ON "resume_versions"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "personal_details" ADD CONSTRAINT "personal_details_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_profiles" ADD CONSTRAINT "career_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_family_skills" ADD CONSTRAINT "role_family_skills_roleFamilyId_fkey" FOREIGN KEY ("roleFamilyId") REFERENCES "role_families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_family_skills" ADD CONSTRAINT "role_family_skills_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_relations" ADD CONSTRAINT "skill_relations_fromSkillId_fkey" FOREIGN KEY ("fromSkillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_relations" ADD CONSTRAINT "skill_relations_toSkillId_fkey" FOREIGN KEY ("toSkillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experience_entries" ADD CONSTRAINT "experience_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_entries" ADD CONSTRAINT "project_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "education_entries" ADD CONSTRAINT "education_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_entries" ADD CONSTRAINT "certification_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "other_cv_sections" ADD CONSTRAINT "other_cv_sections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_facts" ADD CONSTRAINT "career_facts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "resume_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
