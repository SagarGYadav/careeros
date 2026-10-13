"use client";

// Section editors shared by the review screen (whole CV in one form) and the profile pages (one section per
// form). Field names match CvDraft, so both forms use the same components.
import { useId } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Controller, get, useFieldArray, useFormContext, useWatch, type FieldValues } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EMPLOYMENT_TYPES, WORK_MODES, type CvDraft } from "@/lib/cv/schema";
import { NativeSelect, numberOrNull, TagsInput } from "./inputs";
import { FieldFlags, needsAttention, useOriginIndex, useReview } from "./review-context";

const EMPLOYMENT_LABELS: Record<(typeof EMPLOYMENT_TYPES)[number], string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  freelance: "Freelance",
  temporary: "Temporary",
};
const WORK_MODE_LABELS: Record<(typeof WORK_MODES)[number], string> = {
  onsite: "On-site",
  hybrid: "Hybrid",
  remote: "Remote",
};

const emptyToNull = (value: unknown) => (typeof value === "string" && value.trim() === "" ? null : value);

type TextFieldProps = {
  name: string;
  label: string;
  /** Verification path of this field in the original draft (null for items added in the form). */
  flagPath?: string | null;
  /** What the CV preview highlights while this field has focus. */
  quote?: () => string | null | undefined;
  multiline?: boolean;
  nullable?: boolean;
  type?: "text" | "email" | "url" | "number" | "tel";
  placeholder?: string;
  className?: string;
};

/** One labelled input with its validation error and verification flags. */
export function TextField({
  name,
  label,
  flagPath = null,
  quote,
  multiline,
  nullable = true,
  type = "text",
  placeholder,
  className,
}: TextFieldProps) {
  const { register, formState } = useFormContext();
  const review = useReview();
  const id = useId();
  const flags = review.flagsFor(flagPath);
  const error = get(formState.errors, name) as { message?: string } | undefined;
  const registered = register(name, {
    setValueAs: type === "number" ? numberOrNull : nullable ? emptyToNull : undefined,
  });
  const common = {
    id,
    placeholder,
    "aria-invalid": Boolean(error) || needsAttention(flags) || undefined,
    "aria-describedby": flags.length ? `${id}-flags` : undefined,
    onFocus: () => review.showSource(quote?.() ?? null),
    ...registered,
  };
  return (
    <Field data-invalid={Boolean(error) || undefined} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {multiline ? <Textarea rows={2} {...common} /> : <Input type={type} {...common} />}
      <FieldFlags id={`${id}-flags`} flags={flags} />
      {error?.message && <FieldError>{error.message}</FieldError>}
    </Field>
  );
}

function TagsField({
  name,
  label,
  flagPrefix = null,
  quote,
  placeholder,
}: {
  name: string;
  label: string;
  /** Flags on items of this list in the original draft, shown with the item's value. */
  flagPrefix?: string | null;
  quote?: () => string | null | undefined;
  placeholder?: string;
}) {
  const { control } = useFormContext();
  const review = useReview();
  const id = useId();
  const flags = review.flagsUnder(flagPrefix).map((f) => ({ ...f, message: `${f.value}: ${f.message}` }));
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <TagsInput
            id={id}
            value={(field.value as string[]) ?? []}
            onChange={field.onChange}
            onFocus={() => review.showSource(quote?.() ?? null)}
            placeholder={placeholder}
            aria-describedby={flags.length ? `${id}-flags` : undefined}
          />
        )}
      />
      <FieldFlags id={`${id}-flags`} flags={flags} />
    </Field>
  );
}

function SelectField({
  name,
  label,
  options,
  quote,
}: {
  name: string;
  label: string;
  options: Record<string, string>;
  quote?: () => string | null | undefined;
}) {
  const { register } = useFormContext();
  const review = useReview();
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect
        id={id}
        {...register(name, { setValueAs: emptyToNull })}
        onFocus={() => review.showSource(quote?.() ?? null)}
      >
        <option value="">Not stated</option>
        {Object.entries(options).map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}

function SectionFlags({ path }: { path: string }) {
  const flags = useReview().flagsFor(path);
  const id = useId();
  return <FieldFlags id={id} flags={flags} />;
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
      <Trash2 aria-hidden="true" />
    </Button>
  );
}

function AddButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      <Plus aria-hidden="true" />
      {children}
    </Button>
  );
}

const pathOf = (base: string | null, rest: string) => (base === null ? null : `${base}.${rest}`);

// ---------------------------------------------------------------------------------------------------------------
// Bullets

function BulletsEditor({ name, flagBase, label }: { name: string; flagBase: string | null; label: string }) {
  const { control, register, getValues } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name });
  const origin = useOriginIndex(fields);
  const review = useReview();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      {fields.map((field, index) => {
        const o = origin(field.id);
        const flagPath = flagBase !== null && o !== null ? `${flagBase}.bullets.${o}` : null;
        const flags = review.flagsFor(flagPath);
        const textId = `${field.id}-text`;
        return (
          <div key={field.id} className="space-y-1">
            <div className="flex items-start gap-2">
              <Textarea
                id={textId}
                rows={1}
                aria-label={`${label} ${index + 1}`}
                aria-invalid={needsAttention(flags) || undefined}
                aria-describedby={flags.length ? `${textId}-flags` : undefined}
                className="min-h-8"
                {...register(`${name}.${index}.text`)}
                onFocus={() => review.showSource(getValues(`${name}.${index}.text`))}
              />
              <NativeSelect
                aria-label={`Kind of ${label.toLowerCase()} ${index + 1}`}
                className="w-36 shrink-0"
                {...register(`${name}.${index}.kind`)}
              >
                <option value="achievement">Achievement</option>
                <option value="responsibility">Responsibility</option>
              </NativeSelect>
              <RemoveButton label={`Remove ${label.toLowerCase()} ${index + 1}`} onClick={() => remove(index)} />
            </div>
            <FieldFlags id={`${textId}-flags`} flags={flags} />
          </div>
        );
      })}
      <AddButton onClick={() => append({ id: "", text: "", kind: "responsibility", hasMetric: false })}>
        Add {label.toLowerCase().replace(/s$/, "")}
      </AddButton>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Personal details, headline, summary

export function PersonalEditor() {
  const { getValues } = useFormContext();
  const own = (name: string) => () => getValues(name) as string | null;
  return (
    <FieldGroup className="gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="personal.fullName"
          label="Full name"
          flagPath="personal.fullName"
          quote={own("personal.fullName")}
        />
        <TextField name="headline" label="Headline" flagPath="headline" quote={own("headline")} />
        <TextField
          name="personal.email"
          label="Email"
          type="email"
          flagPath="personal.email"
          quote={own("personal.email")}
        />
        <TextField
          name="personal.phone"
          label="Phone"
          type="tel"
          flagPath="personal.phone"
          quote={own("personal.phone")}
        />
        <TextField name="personal.city" label="City" flagPath="personal.city" quote={own("personal.city")} />
        <TextField name="personal.state" label="State" quote={own("personal.state")} />
        <TextField name="personal.country" label="Country" quote={own("personal.country")} />
        <TextField name="personal.linkedin" label="LinkedIn" type="url" flagPath="personal.linkedin" />
        <TextField name="personal.github" label="GitHub" type="url" flagPath="personal.github" />
        <TextField name="personal.portfolio" label="Portfolio" type="url" flagPath="personal.portfolio" />
      </div>
      <TextField name="summary" label="Summary" multiline flagPath="summary" quote={own("summary")} />
      <OtherDetailsEditor />
    </FieldGroup>
  );
}

/** Date of birth, nationality and similar: kept only because the CV contains them, never used for matching. */
function OtherDetailsEditor() {
  const { control, register } = useFormContext();
  const { fields, remove } = useFieldArray({ control, name: "personal.otherDetails" });
  if (!fields.length) return null;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Other personal details</legend>
      <p className="text-xs text-muted-foreground">
        Kept because your CV includes them. CareerOS never uses them for matching or sends them to job sites.
      </p>
      {fields.map((field, index) => (
        <div key={field.id} className="flex items-center gap-2">
          <Input
            aria-label={`Detail ${index + 1} name`}
            className="w-44"
            {...register(`personal.otherDetails.${index}.label`)}
          />
          <Input aria-label={`Detail ${index + 1} value`} {...register(`personal.otherDetails.${index}.value`)} />
          <RemoveButton label={`Remove detail ${index + 1}`} onClick={() => remove(index)} />
        </div>
      ))}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Experience

const NEW_ROLE: CvDraft["experience"][number] = {
  company: "",
  title: "",
  employmentType: null,
  location: null,
  workMode: null,
  startDate: null,
  endDate: null,
  isCurrent: false,
  durationMonths: null,
  domain: null,
  teamSize: null,
  bullets: [],
  technologies: [],
  technologiesEvidenceId: null,
  sourceQuote: "",
};

export function ExperienceEditor() {
  const { control, getValues } = useFormContext<Pick<CvDraft, "experience"> & FieldValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "experience" });
  const origin = useOriginIndex(fields);
  return (
    <div className="space-y-3">
      <SectionFlags path="experience" />
      {fields.map((field, index) => {
        const o = origin(field.id);
        const base = o === null ? null : `experience.${o}`;
        const name = `experience.${index}`;
        const quote = () => getValues(`experience.${index}.sourceQuote`);
        return (
          <Card key={field.id} size="sm">
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <RoleHeading index={index} />
                <RemoveButton label={`Remove role ${index + 1}`} onClick={() => remove(index)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  name={`${name}.title`}
                  label="Job title"
                  nullable={false}
                  flagPath={pathOf(base, "title")}
                  quote={quote}
                />
                <TextField
                  name={`${name}.company`}
                  label="Company"
                  nullable={false}
                  flagPath={pathOf(base, "company")}
                  quote={quote}
                />
                <TextField
                  name={`${name}.startDate`}
                  label="Start (YYYY-MM)"
                  placeholder="2023-04"
                  flagPath={pathOf(base, "startDate")}
                  quote={quote}
                />
                <EndDateField name={name} flagPath={pathOf(base, "endDate")} quote={quote} />
                <SelectField
                  name={`${name}.employmentType`}
                  label="Employment type"
                  options={EMPLOYMENT_LABELS}
                  quote={quote}
                />
                <SelectField name={`${name}.workMode`} label="Work mode" options={WORK_MODE_LABELS} quote={quote} />
                <TextField name={`${name}.location`} label="Location" quote={quote} />
                <TextField
                  name={`${name}.domain`}
                  label="Domain or industry"
                  placeholder="e.g. Fintech"
                  quote={quote}
                />
              </div>
              <TagsField
                name={`${name}.technologies`}
                label="Technologies used"
                flagPrefix={pathOf(base, "technologies")}
                quote={() => (getValues(`experience.${index}.technologies`) ?? []).join(", ")}
                placeholder="Type and press Enter"
              />
              <BulletsEditor name={`${name}.bullets`} flagBase={base} label="Bullets" />
            </CardContent>
          </Card>
        );
      })}
      <AddButton onClick={() => append({ ...NEW_ROLE })}>Add role</AddButton>
    </div>
  );
}

function RoleHeading({ index }: { index: number }) {
  const [title, company] = useWatch({ name: [`experience.${index}.title`, `experience.${index}.company`] });
  return <h3 className="text-sm font-medium">{[title, company].filter(Boolean).join(" · ") || `Role ${index + 1}`}</h3>;
}

function EndDateField({ name, flagPath, quote }: { name: string; flagPath: string | null; quote: () => string }) {
  const { register } = useFormContext();
  const isCurrent = useWatch({ name: `${name}.isCurrent` }) as boolean;
  const id = useId();
  return (
    <div className="space-y-2">
      {isCurrent ? (
        <Field>
          <FieldLabel htmlFor={`${id}-end`}>End (YYYY-MM)</FieldLabel>
          <Input id={`${id}-end`} value="Present" disabled />
        </Field>
      ) : (
        <TextField
          name={`${name}.endDate`}
          label="End (YYYY-MM)"
          placeholder="2024-03"
          flagPath={flagPath}
          quote={quote}
        />
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 accent-[var(--brand)]" {...register(`${name}.isCurrent`)} />I work here
        now
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Projects

const NEW_PROJECT: CvDraft["projects"][number] = {
  name: "",
  role: null,
  description: null,
  technologies: [],
  links: [],
  startDate: null,
  endDate: null,
  bullets: [],
  sourceQuote: "",
};

export function ProjectsEditor() {
  const { control, getValues } = useFormContext<Pick<CvDraft, "projects"> & FieldValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "projects" });
  const origin = useOriginIndex(fields);
  return (
    <div className="space-y-3">
      <SectionFlags path="projects" />
      {fields.map((field, index) => {
        const o = origin(field.id);
        const base = o === null ? null : `projects.${o}`;
        const name = `projects.${index}`;
        const quote = () => getValues(`projects.${index}.sourceQuote`);
        return (
          <Card key={field.id} size="sm">
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium">Project {index + 1}</h3>
                <RemoveButton label={`Remove project ${index + 1}`} onClick={() => remove(index)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  name={`${name}.name`}
                  label="Name"
                  nullable={false}
                  flagPath={pathOf(base, "name")}
                  quote={quote}
                />
                <TextField name={`${name}.role`} label="Your role" quote={quote} />
                <TextField name={`${name}.startDate`} label="Start (YYYY-MM)" quote={quote} />
                <TextField name={`${name}.endDate`} label="End (YYYY-MM)" quote={quote} />
              </div>
              <TextField
                name={`${name}.description`}
                label="Description"
                multiline
                flagPath={pathOf(base, "description")}
                quote={() => getValues(`projects.${index}.description`)}
              />
              <TagsField
                name={`${name}.technologies`}
                label="Technologies"
                flagPrefix={pathOf(base, "technologies")}
                placeholder="Type and press Enter"
              />
              <TagsField name={`${name}.links`} label="Links" placeholder="https://…" />
              <BulletsEditor name={`${name}.bullets`} flagBase={base} label="Highlights" />
            </CardContent>
          </Card>
        );
      })}
      <AddButton onClick={() => append({ ...NEW_PROJECT })}>Add project</AddButton>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Education and certifications

export function EducationEditor() {
  const { control, getValues } = useFormContext<Pick<CvDraft, "education"> & FieldValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "education" });
  const origin = useOriginIndex(fields);
  return (
    <div className="space-y-3">
      <SectionFlags path="education" />
      {fields.map((field, index) => {
        const o = origin(field.id);
        const base = o === null ? null : `education.${o}`;
        const name = `education.${index}`;
        const quote = () => getValues(`education.${index}.sourceQuote`);
        return (
          <Card key={field.id} size="sm">
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium">Education {index + 1}</h3>
                <RemoveButton label={`Remove education ${index + 1}`} onClick={() => remove(index)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  name={`${name}.institution`}
                  label="Institution"
                  nullable={false}
                  flagPath={pathOf(base, "institution")}
                  quote={quote}
                />
                <TextField
                  name={`${name}.degree`}
                  label="Degree"
                  nullable={false}
                  flagPath={pathOf(base, "degree")}
                  quote={quote}
                />
                <TextField
                  name={`${name}.field`}
                  label="Field of study"
                  flagPath={pathOf(base, "field")}
                  quote={quote}
                />
                <TextField
                  name={`${name}.grade`}
                  label="Grade (CGPA or %)"
                  flagPath={pathOf(base, "grade")}
                  quote={quote}
                />
                <TextField
                  name={`${name}.startDate`}
                  label="Start (YYYY-MM)"
                  flagPath={pathOf(base, "startDate")}
                  quote={quote}
                />
                <TextField
                  name={`${name}.endDate`}
                  label="End (YYYY-MM)"
                  flagPath={pathOf(base, "endDate")}
                  quote={quote}
                />
              </div>
            </CardContent>
          </Card>
        );
      })}
      <AddButton
        onClick={() =>
          append({
            evidenceId: "",
            institution: "",
            degree: "",
            field: null,
            location: null,
            startDate: null,
            endDate: null,
            grade: null,
            sourceQuote: "",
          })
        }
      >
        Add education
      </AddButton>
    </div>
  );
}

export function CertificationsEditor() {
  const { control, getValues } = useFormContext<Pick<CvDraft, "certifications"> & FieldValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "certifications" });
  const origin = useOriginIndex(fields);
  return (
    <div className="space-y-3">
      <SectionFlags path="certifications" />
      {fields.map((field, index) => {
        const o = origin(field.id);
        const base = o === null ? null : `certifications.${o}`;
        const name = `certifications.${index}`;
        const quote = () => getValues(`certifications.${index}.sourceQuote`);
        return (
          <Card key={field.id} size="sm">
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium">Certification {index + 1}</h3>
                <RemoveButton label={`Remove certification ${index + 1}`} onClick={() => remove(index)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  name={`${name}.name`}
                  label="Name"
                  nullable={false}
                  flagPath={pathOf(base, "name")}
                  quote={quote}
                />
                <TextField name={`${name}.issuer`} label="Issuer" flagPath={pathOf(base, "issuer")} quote={quote} />
                <TextField
                  name={`${name}.issueDate`}
                  label="Issued (YYYY-MM)"
                  flagPath={pathOf(base, "issueDate")}
                  quote={quote}
                />
                <TextField name={`${name}.expiryDate`} label="Expires (YYYY-MM)" quote={quote} />
                <TextField
                  name={`${name}.credentialId`}
                  label="Credential ID"
                  flagPath={pathOf(base, "credentialId")}
                  quote={quote}
                />
                <TextField name={`${name}.url`} label="Credential URL" type="url" quote={quote} />
              </div>
            </CardContent>
          </Card>
        );
      })}
      <AddButton
        onClick={() =>
          append({
            evidenceId: "",
            name: "",
            issuer: null,
            issueDate: null,
            expiryDate: null,
            credentialId: null,
            url: null,
            sourceQuote: "",
          })
        }
      >
        Add certification
      </AddButton>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Skills (review screen)

type ExplicitSkill = CvDraft["skills"]["explicit"][number];

/** Skills grouped as the CV lists them; each group edits its names as chips. */
export function SkillsEditor() {
  const { control } = useFormContext<Pick<CvDraft, "skills"> & FieldValues>();
  const review = useReview();
  return (
    <div className="space-y-4">
      <SectionFlags path="skills" />
      <Controller
        control={control}
        name="skills.explicit"
        render={({ field }) => {
          const skills = (field.value ?? []) as ExplicitSkill[];
          const groups = [...new Set(skills.map((s) => s.category ?? ""))];
          // Flags carry the skill name as their value, so they stay right after edits.
          const flagged = review.flagsUnder("skills.explicit");
          const setGroup = (group: string, names: string[]) => {
            const kept = new Map(skills.filter((s) => (s.category ?? "") === group).map((s) => [s.name, s]));
            const others = skills.filter((s) => (s.category ?? "") !== group);
            const updated = names.map((n) => kept.get(n) ?? { name: n, category: group || null, evidenceIds: [] });
            field.onChange([...others, ...updated]);
          };
          return (
            <div className="space-y-3">
              {groups.map((group) => (
                <SkillGroup
                  key={group || "ungrouped"}
                  label={group || "Skills"}
                  names={skills.filter((s) => (s.category ?? "") === group).map((s) => s.name)}
                  onChange={(names) => setGroup(group, names)}
                  onFocus={() =>
                    review.showSource(
                      skills
                        .filter((s) => (s.category ?? "") === group)
                        .map((s) => s.name)
                        .join(", "),
                    )
                  }
                />
              ))}
              {!groups.length && (
                <SkillGroup label="Skills" names={[]} onChange={(names) => setGroup("", names)} onFocus={() => {}} />
              )}
              {flagged.length > 0 && (
                <FieldFlags
                  id="skills-flags"
                  flags={flagged.map((f) => ({ ...f, message: `${f.value}: ${f.message}` }))}
                />
              )}
            </div>
          );
        }}
      />
      <Controller
        control={control}
        name="skills.inferred"
        render={({ field }) => {
          const inferred = (field.value ?? []) as CvDraft["skills"]["inferred"];
          if (!inferred.length) return <></>;
          return (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Also used in your experience</legend>
              <p className="text-xs text-muted-foreground">
                Not in your skills section, but named in a role or project. Remove any you don&apos;t want on your
                profile.
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {inferred.map((skill, index) => (
                  <li key={`${skill.name}-${index}`} className="inline-flex items-center rounded-md border text-xs">
                    <button
                      type="button"
                      className="min-h-6 rounded-sm pl-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      title="Show where your CV mentions it"
                      onClick={() => review.showSource(skill.evidenceQuote)}
                    >
                      {skill.name}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${skill.name}`}
                      className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      onClick={() => field.onChange(inferred.filter((_, i) => i !== index))}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </fieldset>
          );
        }}
      />
      <TagsField name="skills.soft" label="Soft skills" placeholder="e.g. Mentoring" />
    </div>
  );
}

function SkillGroup({
  label,
  names,
  onChange,
  onFocus,
}: {
  label: string;
  names: string[];
  onChange: (names: string[]) => void;
  onFocus: () => void;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <TagsInput id={id} value={names} onChange={onChange} onFocus={onFocus} placeholder="Type and press Enter" />
    </Field>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Other sections and job-search details

export function OtherSectionsEditor() {
  const { control, register } = useFormContext<Pick<CvDraft, "otherSections"> & FieldValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "otherSections" });
  return (
    <div className="space-y-3">
      {fields.map((field, index) => (
        <Card key={field.id} size="sm">
          <CardContent className="space-y-3">
            <div className="flex items-end gap-2">
              <Field className="flex-1">
                <FieldLabel htmlFor={`${field.id}-heading`}>Heading</FieldLabel>
                <Input id={`${field.id}-heading`} {...register(`otherSections.${index}.heading`)} />
              </Field>
              <NativeSelect
                aria-label={`Kind of section ${index + 1}`}
                className="w-40"
                {...register(`otherSections.${index}.kind`)}
              >
                <option value="awards">Awards</option>
                <option value="languages">Languages</option>
                <option value="interests">Interests</option>
                <option value="publications">Publications</option>
                <option value="volunteering">Volunteering</option>
                <option value="other">Other</option>
              </NativeSelect>
              <RemoveButton label={`Remove section ${index + 1}`} onClick={() => remove(index)} />
            </div>
            <Controller
              control={control}
              name={`otherSections.${index}.items`}
              render={({ field: items }) => (
                <Field>
                  <FieldLabel htmlFor={`${field.id}-items`}>Items (one per line)</FieldLabel>
                  <Textarea
                    id={`${field.id}-items`}
                    rows={2}
                    defaultValue={((items.value as string[]) ?? []).join("\n")}
                    onBlur={(event) =>
                      items.onChange(
                        event.target.value
                          .split("\n")
                          .map((line) => line.trim())
                          .filter(Boolean),
                      )
                    }
                  />
                </Field>
              )}
            />
          </CardContent>
        </Card>
      ))}
      <AddButton onClick={() => append({ kind: "other", heading: "", items: [] })}>Add section</AddButton>
    </div>
  );
}

export function JobSearchEditor() {
  const { getValues } = useFormContext();
  const own = (name: string) => () => getValues(name) as string | null;
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        As written in your CV. On confirm they fill any empty fields in your preferences.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          name="jobSearch.noticePeriod"
          label="Notice period"
          flagPath="jobSearch.noticePeriod"
          quote={own("jobSearch.noticePeriod")}
        />
        <TextField
          name="jobSearch.currentCtc"
          label="Current CTC"
          flagPath="jobSearch.currentCtc"
          quote={own("jobSearch.currentCtc")}
        />
        <TextField
          name="jobSearch.expectedCtc"
          label="Expected CTC"
          flagPath="jobSearch.expectedCtc"
          quote={own("jobSearch.expectedCtc")}
        />
      </div>
      <TagsField name="jobSearch.preferredLocations" label="Preferred locations" placeholder="Type and press Enter" />
    </div>
  );
}
