"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Globe } from "lucide-react";
import { toast } from "sonner";
import { addJobAction, readJobFromUrlAction } from "@/app/(app)/jobs/new/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addJobSchema, type AddJobInput, type AddJobValues } from "@/lib/validation/job";

const EMPTY: AddJobInput = {
  title: "",
  company: "",
  location: "",
  workMode: null,
  salaryText: "",
  description: "",
  applyUrl: "",
  origin: "paste",
};

function TextField({
  form,
  name,
  label,
  hint,
}: {
  form: ReturnType<typeof useForm<AddJobInput, unknown, AddJobValues>>;
  name: "title" | "company" | "location" | "salaryText" | "applyUrl";
  label: string;
  hint?: string;
}) {
  const id = useId();
  const error = form.formState.errors[name]?.message;
  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} aria-invalid={Boolean(error) || undefined} {...form.register(name)} />
      {hint && !error && <FieldDescription>{hint}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}

/** Add job (SPEC §2): read it from a job page's link, or paste/type it. Either way it is saved, then analysed. */
export function AddJobForm() {
  const router = useRouter();
  const form = useForm<AddJobInput, unknown, AddJobValues>({
    resolver: zodResolver(addJobSchema),
    defaultValues: EMPTY,
  });
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [reading, startReading] = useTransition();
  const urlId = useId();
  const descriptionId = useId();
  const modeId = useId();
  const { errors, isSubmitting } = form.formState;

  function readUrl() {
    setUrlError(null);
    startReading(async () => {
      const result = await readJobFromUrlAction({ url });
      if (!result.ok) return setUrlError(result.message);
      const job = result.data;
      form.reset({
        title: job.title,
        company: job.company,
        location: job.location ?? "",
        workMode: job.workMode,
        salaryText: job.salaryText ?? "",
        description: job.description,
        applyUrl: job.applyUrl ?? "",
        origin: "url",
      });
      toast.success("Read the job from the page. Check the details, then save.");
    });
  }

  async function onSubmit(values: AddJobValues) {
    const result = await addJobAction(values);
    if (!result.ok) return void toast.error(result.message);
    toast.success(result.data.duplicate ? "You already have this job; opening it." : "Job added.");
    router.push(`/jobs/${result.data.jobId}`);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle as="h2">From a job page</CardTitle>
          <CardDescription>
            Reads the job from the page&apos;s published job data (most company career pages and job boards have it).
            LinkedIn and Naukri pages can&apos;t be read; paste those instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              readUrl();
            }}
          >
            <Field className="min-w-64 flex-1" data-invalid={Boolean(urlError) || undefined}>
              <FieldLabel htmlFor={urlId}>Job page link</FieldLabel>
              <Input
                id={urlId}
                type="url"
                inputMode="url"
                placeholder="https://"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                aria-invalid={Boolean(urlError) || undefined}
              />
              {urlError && <FieldError>{urlError}</FieldError>}
            </Field>
            <Button type="submit" variant="outline" disabled={reading || !url.trim()}>
              <Globe aria-hidden="true" />
              {reading ? "Reading…" : "Read job"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Job details</CardTitle>
          <CardDescription>Paste the description and fill in what the posting says.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField form={form} name="title" label="Job title" />
              <TextField form={form} name="company" label="Company" />
              <TextField form={form} name="location" label="Location" hint="City, or “Remote”." />
              <Field>
                <FieldLabel htmlFor={modeId}>Work mode</FieldLabel>
                <select
                  id={modeId}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  {...form.register("workMode", { setValueAs: (v) => (v ? v : null) })}
                >
                  <option value="">Not stated</option>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="onsite">On-site</option>
                </select>
              </Field>
              <TextField form={form} name="salaryText" label="Salary" hint="As written, e.g. “18-24 LPA”." />
              <TextField form={form} name="applyUrl" label="Link to apply" hint="Optional." />
            </div>
            <Field data-invalid={Boolean(errors.description) || undefined}>
              <FieldLabel htmlFor={descriptionId}>Job description</FieldLabel>
              <Textarea
                id={descriptionId}
                rows={12}
                aria-invalid={Boolean(errors.description) || undefined}
                {...form.register("description")}
              />
              {errors.description?.message ? (
                <FieldError>{errors.description.message}</FieldError>
              ) : (
                <FieldDescription>The whole posting: responsibilities, requirements and conditions.</FieldDescription>
              )}
            </Field>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save job"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
