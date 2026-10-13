import type { Metadata } from "next";
import { Suspense } from "react";
import { SkillsTable, type SkillRow } from "@/features/profile/skills-table";
import { getCurrentUser } from "@/server/auth/session";
import { listUserSkills } from "@/server/repositories/skills";
import { SectionHeader, SectionSkeleton } from "../section-shell";

export const metadata: Metadata = { title: "Skills · Career profile" };

export default function SkillsPage() {
  return (
    <>
      <SectionHeader
        title="Skills"
        description="Levels are suggested from how long and how recently your CV shows each skill. Confirm or change them."
        active="/profile/skills"
      />
      <Suspense fallback={<SectionSkeleton />}>
        <Skills />
      </Suspense>
    </>
  );
}

async function Skills() {
  const user = await getCurrentUser();
  const skills = await listUserSkills(user.id);
  const rows: SkillRow[] = skills.map((s) => ({
    id: s.id,
    name: s.skill.name,
    category: s.skill.category,
    proficiency: s.proficiency,
    proficiencySource: s.proficiencySource,
    proficiencyReason: s.proficiencyReason,
    years: s.years,
    lastUsedYear: s.lastUsedYear,
    evidenceCount: s.evidenceIds.length,
    source: s.source,
    confirmed: s.confirmed,
    unreviewed: s.skill.unreviewed,
  }));
  return <SkillsTable rows={rows} />;
}
