import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TriangleAlert } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ReviewForm } from "@/features/profile/review-form";
import { cvDraftSchema } from "@/lib/cv/schema";
import type { VerificationFlag } from "@/lib/cv/verify";
import { getCurrentUser } from "@/server/auth/session";
import { getResumeVersion } from "@/server/repositories/resumes";
import { LinkButton } from "@/components/link-button";

export const metadata: Metadata = { title: "Review CV" };

const flagsSchema = z
  .object({
    flags: z.array(
      z.object({ path: z.string(), issue: z.string(), message: z.string(), value: z.string().nullable().optional() }),
    ),
  })
  .catch({ flags: [] });

export default function ReviewPage({ params }: PageProps<"/profile/cv/[resumeId]">) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="-mb-3 text-sm text-muted-foreground">
        <Link href="/profile" className="hover:text-foreground">
          Career profile
        </Link>{" "}
        / Review CV
      </nav>
      <Suspense fallback={<ReviewSkeleton />}>
        <Review params={params} />
      </Suspense>
    </>
  );
}

function ReviewSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading your CV">
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-[70svh] rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function ParseModeNote({ mode, provider }: { mode: string | null; provider: string | null }) {
  if (provider === "mock") {
    return (
      <Badge variant="warning" title="No AI key is set, so the built-in reader answered as the mock AI.">
        Mock AI
      </Badge>
    );
  }
  if (mode === "no_ai") return <Badge variant="info">Read without AI</Badge>;
  if (mode === "cache") return <Badge variant="outline">Read earlier ({provider})</Badge>;
  return provider ? <Badge variant="brand">Read by AI · {provider}</Badge> : null;
}

async function Review({ params }: { params: Promise<{ resumeId: string }> }) {
  const { resumeId } = await params;
  const user = await getCurrentUser();
  const resume = await getResumeVersion(user.id, resumeId);
  if (!resume) notFound();

  const draft = cvDraftSchema.safeParse(resume.parsed);
  if (resume.parseStatus === "failed" || resume.parseStatus === "uploaded" || !draft.success) {
    return (
      <>
        <PageHeader title="We couldn't read this CV" />
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>No details were extracted from {resume.name}.</AlertTitle>
          <AlertDescription>
            The file may be a scanned image or damaged. Export it again as a text PDF or DOCX and upload it.
          </AlertDescription>
        </Alert>
        <div>
          <LinkButton href="/profile/upload">Upload another file</LinkButton>
        </div>
      </>
    );
  }

  const flags = flagsSchema.parse(resume.verification).flags as VerificationFlag[];
  const attention = flags.filter((f) => f.issue !== "added_from_text" && f.issue !== "overridden").length;

  return (
    <>
      <PageHeader
        title={resume.parseStatus === "confirmed" ? "Your CV" : "Review your CV"}
        description={
          resume.parseStatus === "confirmed"
            ? "This version is saved to your profile. Saving again replaces your profile with these details."
            : "Check what CareerOS read. Select a field to see where it comes from in the CV."
        }
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <ParseModeNote mode={resume.parseMode} provider={resume.parseProvider} />
        {attention > 0 ? (
          <span className="text-warning">{attention} fields to check</span>
        ) : (
          <span className="text-muted-foreground">Every field was found in your CV.</span>
        )}
      </div>
      {resume.injectionSuspected && (
        <Alert>
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Suspicious text in this file</AlertTitle>
          <AlertDescription>
            The CV contains text that looks like instructions to an AI. CareerOS treated it as plain text; check the
            extracted fields carefully.
          </AlertDescription>
        </Alert>
      )}
      <ReviewForm
        resumeId={resume.id}
        draft={draft.data}
        flags={flags}
        fileUrl={resume.fileId ? `/api/files/${resume.fileId}` : null}
        isPdf={resume.pageCount !== null}
        text={resume.extractedText ?? ""}
      />
    </>
  );
}
