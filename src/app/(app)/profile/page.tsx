import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { TrustBadge } from "@/components/trust-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CvUpload } from "@/features/profile/cv-upload";
import { ProfileNav } from "@/features/profile/profile-nav";
import { formatDate } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";
import { getProfileOverview } from "@/server/services/profile-view";
import { LinkButton } from "@/components/link-button";

export const metadata: Metadata = { title: "Career profile" };

export default function ProfilePage() {
  return (
    <>
      <PageHeader
        title="Career profile"
        description="What CareerOS knows about you. It drives role suggestions, job search and matching."
        action={<LinkButton href="/profile/upload">Upload CV</LinkButton>}
      />
      <ProfileNav active="/profile" />
      <Suspense fallback={<OverviewSkeleton />}>
        <Overview />
      </Suspense>
    </>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading your profile">
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

const STATUS: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "outline" }> = {
  confirmed: { label: "Confirmed", variant: "success" },
  parsed: { label: "Ready to review", variant: "warning" },
  failed: { label: "Couldn't read", variant: "destructive" },
  uploaded: { label: "Uploaded", variant: "outline" },
};

async function Overview() {
  const user = await getCurrentUser();
  const { personal, profile, counts, resumes } = await getProfileOverview(user.id);
  const toReview = resumes.find((r) => r.parseStatus === "parsed");

  if (!resumes.length && !personal) {
    return (
      <div className="space-y-3">
        <CvUpload />
        <p className="text-center text-xs text-muted-foreground">
          Your CV builds your profile: experience, skills and evidence that every match and report refers to.
        </p>
      </div>
    );
  }

  const location = [personal?.city, personal?.state, personal?.country].filter(Boolean).join(", ");
  const sections = [
    { href: "/profile/experience", label: "Experience", value: `${counts.experience} roles` },
    { href: "/profile/projects", label: "Projects", value: `${counts.projects}` },
    {
      href: "/profile/education",
      label: "Education",
      value: `${counts.education} · ${counts.certifications} certifications`,
    },
    {
      href: "/profile/skills",
      label: "Skills",
      value: `${counts.skills}`,
      note: counts.skillsToConfirm ? `${counts.skillsToConfirm} levels to confirm` : undefined,
    },
    {
      href: "/profile/preferences",
      label: "Preferences",
      value: profile?.preferredLocations.length || profile?.workModes.length ? "Set" : "Not set",
    },
    { href: "/profile/memory", label: "Memory", value: `${counts.facts} facts` },
    { href: "/profile/details", label: "Other sections", value: `${counts.otherSections}` },
  ];

  return (
    <div className="space-y-4">
      {toReview && (
        <Card className="ring-warning/40">
          <CardHeader>
            <CardTitle as="h2">Your CV is ready to review</CardTitle>
            <CardDescription>
              Check what CareerOS read from {toReview.file?.fileName ?? toReview.name} and confirm it to update your
              profile.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LinkButton href={`/profile/cv/${toReview.id}`}>Review CV</LinkButton>
          </CardContent>
        </Card>
      )}

      {personal && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">{personal.fullName ?? user.name}</CardTitle>
            {profile?.headline && <CardDescription>{profile.headline}</CardDescription>}
          </CardHeader>
          <CardContent className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {location && <span>{location}</span>}
            {personal.email && <span>{personal.email}</span>}
            {profile?.yearsExperience != null && (
              <span className="inline-flex items-center gap-1.5">
                <span className="tabular-nums">{profile.yearsExperience} years</span> of experience
                <TrustBadge kind="calc" />
              </span>
            )}
          </CardContent>
        </Card>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {sections.map((section) => (
          <li key={section.label}>
            <Link
              href={section.href}
              className="block h-full rounded-xl p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <p className="text-sm text-muted-foreground">{section.label}</p>
              <p className="mt-1 text-lg font-medium tabular-nums">{section.value}</p>
              {section.note && <p className="text-xs text-warning">{section.note}</p>}
            </Link>
          </li>
        ))}
      </ul>

      <Card>
        <CardHeader>
          <CardTitle as="h2">CV versions</CardTitle>
          <CardDescription>The confirmed version is the one your profile and matches use.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {resumes.map((resume) => {
              const status = STATUS[resume.parseStatus] ?? STATUS.uploaded;
              return (
                <li key={resume.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{resume.name}</p>
                    <p className="text-xs text-muted-foreground">Uploaded {formatDate(resume.createdAt)}</p>
                  </div>
                  {resume.isDefault && <Badge variant="brand">In use</Badge>}
                  <Badge variant={status.variant}>{status.label}</Badge>
                  {(resume.parseStatus === "parsed" || resume.parseStatus === "confirmed") && (
                    <LinkButton variant="outline" size="sm" href={`/profile/cv/${resume.id}`}>
                      {resume.parseStatus === "parsed" ? "Review" : "Open"}
                    </LinkButton>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
