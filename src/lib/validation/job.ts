// Add job (SPEC §2 "Add job", §12.1): what a pasted, fetched or hand-entered job must contain.
import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters.`)
    .transform((v) => v || null)
    .nullable();

export const addJobSchema = z.object({
  title: z.string().trim().min(2, "Enter the job title.").max(120, "Keep the title under 120 characters."),
  company: z.string().trim().min(1, "Enter the company.").max(120, "Keep it under 120 characters."),
  location: optionalText(120),
  workMode: z.enum(["remote", "hybrid", "onsite"]).nullable(),
  salaryText: optionalText(80),
  description: z
    .string()
    .trim()
    .min(200, "Paste the full description (at least 200 characters), so the requirements can be read.")
    .max(30_000, "That description is too long (30,000 characters at most)."),
  applyUrl: z
    .string()
    .trim()
    .url("Enter a full link starting with https://")
    .max(2_000)
    .or(z.literal(""))
    .transform((v) => v || null)
    .nullable(),
  /** How the job came in: pasted text, read from a URL, or typed in. */
  origin: z.enum(["paste", "url", "manual"]),
});

export type AddJobInput = z.input<typeof addJobSchema>;
export type AddJobValues = z.output<typeof addJobSchema>;

export const jobDescriptionSchema = z.object({
  description: addJobSchema.shape.description,
});
