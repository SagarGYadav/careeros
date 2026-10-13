"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { confirmResumeAction } from "@/app/(app)/profile/actions";
import { cvDraftSchema, type CvDraft } from "@/lib/cv/schema";
import type { VerificationFlag } from "@/lib/cv/verify";
import { CvPreview } from "./cv-preview";
import { ReviewProvider, needsAttention } from "./review-context";
import {
  CertificationsEditor,
  EducationEditor,
  ExperienceEditor,
  JobSearchEditor,
  OtherSectionsEditor,
  PersonalEditor,
  ProjectsEditor,
  SkillsEditor,
} from "./section-editors";

function Section({
  title,
  description,
  flags,
  children,
}: {
  title: string;
  description?: string;
  flags: VerificationFlag[];
  children: React.ReactNode;
}) {
  const attention = flags.filter((f) => needsAttention([f])).length;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle as="h2">{title}</CardTitle>
          {attention > 0 && <Badge variant="warning">{attention} to check</Badge>}
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const under = (flags: VerificationFlag[], ...prefixes: string[]) =>
  flags.filter((f) => prefixes.some((p) => f.path === p || f.path.startsWith(`${p}.`)));

export function ReviewForm({
  resumeId,
  draft,
  flags,
  fileUrl,
  isPdf,
  text,
}: {
  resumeId: string;
  draft: CvDraft;
  flags: VerificationFlag[];
  fileUrl: string | null;
  isPdf: boolean;
  text: string;
}) {
  const router = useRouter();
  const [quote, setQuote] = useState<string | null>(null);
  const form = useForm<CvDraft>({ resolver: zodResolver(cvDraftSchema), defaultValues: draft });
  const { isSubmitting } = form.formState;

  async function onSubmit(values: CvDraft) {
    const result = await confirmResumeAction(resumeId, values);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Saved to your profile.");
    router.push("/profile");
  }

  return (
    <ReviewProvider flags={flags} onShowSource={setQuote}>
      <FormProvider {...form}>
        <div className="grid gap-6 lg:grid-cols-2">
          <aside aria-label="Your CV" className="lg:sticky lg:top-4 lg:h-[calc(100svh-6rem)]">
            <CvPreview fileUrl={fileUrl} isPdf={isPdf} text={text} quote={quote} className="h-96 lg:h-full" />
          </aside>
          <form
            onSubmit={form.handleSubmit(onSubmit, () => toast.error("Some fields need fixing. They're marked in red."))}
            noValidate
            className="space-y-4"
          >
            <Section title="Personal details" flags={under(flags, "personal", "headline", "summary")}>
              <PersonalEditor />
            </Section>
            <Section title="Experience" flags={under(flags, "experience")}>
              <ExperienceEditor />
            </Section>
            <Section title="Projects" flags={under(flags, "projects")}>
              <ProjectsEditor />
            </Section>
            <Section title="Education" flags={under(flags, "education")}>
              <EducationEditor />
            </Section>
            <Section title="Certifications" flags={under(flags, "certifications")}>
              <CertificationsEditor />
            </Section>
            <Section title="Skills" flags={under(flags, "skills")}>
              <SkillsEditor />
            </Section>
            <Section
              title="Other sections"
              description="Awards, languages, interests and anything else in your CV. Nothing is dropped."
              flags={under(flags, "otherSections")}
            >
              <OtherSectionsEditor />
            </Section>
            <Section title="Job-search details" flags={under(flags, "jobSearch")}>
              <JobSearchEditor />
            </Section>
            <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
              <p className="mr-auto text-xs text-muted-foreground">
                Nothing is saved to your profile until you confirm.
              </p>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Confirm and save to profile"}
              </Button>
            </div>
          </form>
        </div>
      </FormProvider>
    </ReviewProvider>
  );
}
