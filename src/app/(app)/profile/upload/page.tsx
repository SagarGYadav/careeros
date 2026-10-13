import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { AiStatusBadge } from "@/features/services/ai-status";
import { CvUpload } from "@/features/profile/cv-upload";

export const metadata: Metadata = { title: "Upload CV" };

export default function UploadPage() {
  return (
    <>
      <nav aria-label="Breadcrumb" className="-mb-3 text-sm text-muted-foreground">
        <Link href="/profile" className="hover:text-foreground">
          Career profile
        </Link>{" "}
        / Upload CV
      </nav>
      <PageHeader
        title="Upload your CV"
        description="CareerOS reads your details, checks every field against the file, and shows you everything before saving."
      />
      <div className="mx-auto w-full max-w-xl space-y-3">
        <Suspense fallback={<Skeleton className="h-5 w-24" />}>
          <AiStatusBadge />
        </Suspense>
        <CvUpload />
        <p className="text-xs text-muted-foreground">
          Your file stays in your CareerOS database. Contact details and personal information are never sent to job
          sites.
        </p>
      </div>
    </>
  );
}
