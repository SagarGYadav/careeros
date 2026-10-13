import type { Metadata } from "next";
import { Suspense } from "react";
import { MemoryList } from "@/features/profile/memory-list";
import { getCurrentUser } from "@/server/auth/session";
import { listCareerFacts } from "@/server/repositories/career-facts";
import { SectionHeader, SectionSkeleton } from "../section-shell";

export const metadata: Metadata = { title: "Memory · Career profile" };

export default function MemoryPage() {
  return (
    <>
      <SectionHeader
        title="Memory"
        description="Facts about you and your search that aren't in your CV. Matching and reports take them into account."
        active="/profile/memory"
      />
      <Suspense fallback={<SectionSkeleton />}>
        <Memory />
      </Suspense>
    </>
  );
}

async function Memory() {
  const user = await getCurrentUser();
  const facts = await listCareerFacts(user.id);
  return (
    <MemoryList
      facts={facts.map((f) => ({
        id: f.id,
        text: f.text,
        category: f.category,
        source: f.source,
        status: f.status,
        createdAt: f.createdAt.toISOString(),
      }))}
    />
  );
}
