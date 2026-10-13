"use client";

import {
  saveDetailsAction,
  saveEducationAction,
  saveExperienceAction,
  saveProjectsAction,
} from "@/app/(app)/profile/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cvDraftSchema, type CvDraft } from "@/lib/cv/schema";
import { SectionForm } from "./section-form";
import {
  CertificationsEditor,
  EducationEditor,
  ExperienceEditor,
  OtherSectionsEditor,
  PersonalEditor,
  ProjectsEditor,
} from "./section-editors";

// Schemas live at module scope (client side); Server Actions validate again with the same schemas.
const detailsSchema = cvDraftSchema.pick({ personal: true, headline: true, summary: true, otherSections: true });
const experienceSchema = cvDraftSchema.pick({ experience: true });
const projectsSchema = cvDraftSchema.pick({ projects: true });
const educationSchema = cvDraftSchema.pick({ education: true, certifications: true });

type Details = Pick<CvDraft, "personal" | "headline" | "summary" | "otherSections">;

export function DetailsForm({ defaultValues }: { defaultValues: Details }) {
  return (
    <SectionForm
      schema={detailsSchema}
      defaultValues={defaultValues}
      action={saveDetailsAction}
      savedMessage="Details saved."
    >
      <Card>
        <CardHeader>
          <CardTitle as="h2">Personal details</CardTitle>
          <CardDescription>Used on your profile only. Never sent to job sites.</CardDescription>
        </CardHeader>
        <CardContent>
          <PersonalEditor />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle as="h2">Other sections</CardTitle>
          <CardDescription>Awards, languages, interests and anything else from your CV.</CardDescription>
        </CardHeader>
        <CardContent>
          <OtherSectionsEditor />
        </CardContent>
      </Card>
    </SectionForm>
  );
}

export function ExperienceForm({ defaultValues }: { defaultValues: Pick<CvDraft, "experience"> }) {
  return (
    <SectionForm
      schema={experienceSchema}
      defaultValues={defaultValues}
      action={saveExperienceAction}
      savedMessage="Experience saved."
    >
      <ExperienceEditor />
    </SectionForm>
  );
}

export function ProjectsForm({ defaultValues }: { defaultValues: Pick<CvDraft, "projects"> }) {
  return (
    <SectionForm
      schema={projectsSchema}
      defaultValues={defaultValues}
      action={saveProjectsAction}
      savedMessage="Projects saved."
    >
      <ProjectsEditor />
    </SectionForm>
  );
}

export function EducationForm({ defaultValues }: { defaultValues: Pick<CvDraft, "education" | "certifications"> }) {
  return (
    <SectionForm
      schema={educationSchema}
      defaultValues={defaultValues}
      action={saveEducationAction}
      savedMessage="Education and certifications saved."
    >
      <Card>
        <CardHeader>
          <CardTitle as="h2">Education</CardTitle>
        </CardHeader>
        <CardContent>
          <EducationEditor />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle as="h2">Certifications</CardTitle>
        </CardHeader>
        <CardContent>
          <CertificationsEditor />
        </CardContent>
      </Card>
    </SectionForm>
  );
}
