-- CreateTable
CREATE TABLE "target_roles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleFamilyId" TEXT,
    "title" TEXT NOT NULL,
    "reason" TEXT,
    "reasonVerified" BOOLEAN NOT NULL DEFAULT true,
    "evidenceIds" TEXT[],
    "titleVariants" TEXT[],
    "keywords" TEXT[],
    "marketStats" JSONB,
    "source" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "target_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "target_roles_userId_selected_idx" ON "target_roles"("userId", "selected");

-- AddForeignKey
ALTER TABLE "target_roles" ADD CONSTRAINT "target_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_roles" ADD CONSTRAINT "target_roles_roleFamilyId_fkey" FOREIGN KEY ("roleFamilyId") REFERENCES "role_families"("id") ON DELETE SET NULL ON UPDATE CASCADE;
