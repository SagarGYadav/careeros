// Application tracking inputs (SPEC §13): Mark as applied, status changes and interview rounds.
import { z } from "zod";
import {
  APPLICATION_SOURCES,
  APPLICATION_STATUSES,
  REJECTION_REASONS,
  ROUND_TYPES,
  STAGE_STATUSES,
  type ApplicationSource,
  type RejectionReason,
  type RoundType,
} from "@/lib/applications/status";

const id = z.string().min(1).max(64);
const keys = <T extends string>(record: Record<T, string>) => Object.keys(record) as [T, ...T[]];
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters.`)
    .transform((v) => v || null)
    .nullable()
    .optional();
/** The browser turns the chosen date (or "now") into an ISO time, so the user's own time zone decides the day. */
const isoTime = z.iso.datetime({ offset: true, message: "Enter a valid date." }).transform((v) => new Date(v));

export const markAppliedSchema = z
  .object({
    appliedAt: isoTime,
    resumeVersionId: id.nullable(),
    source: z.enum(keys<ApplicationSource>(APPLICATION_SOURCES)),
    isReferral: z.boolean(),
    referrerName: optionalText(120),
    /** A recruiter reached out first: starts at "Recruiter contact" and is left out of outbound rates. */
    inbound: z.boolean(),
    notes: optionalText(2_000),
  })
  .transform((v) => ({ ...v, referrerName: v.isReferral ? (v.referrerName ?? null) : null }));
export type MarkAppliedValues = z.output<typeof markAppliedSchema>;

export const changeStatusSchema = z.object({
  applicationId: id,
  to: z.enum(APPLICATION_STATUSES),
  occurredAt: isoTime,
  rejectionReason: z.enum(keys<RejectionReason>(REJECTION_REASONS)).nullable().optional(),
  rejectedAtStage: z
    .enum(STAGE_STATUSES as [string, ...string[]])
    .nullable()
    .optional(),
  note: optionalText(2_000),
});
export type ChangeStatusValues = z.output<typeof changeStatusSchema>;

export const addRoundSchema = z.object({
  applicationId: id,
  roundType: z.enum(keys<RoundType>(ROUND_TYPES)),
  scheduledAt: isoTime.nullable(),
  notes: optionalText(2_000),
});
export type AddRoundValues = z.output<typeof addRoundSchema>;

export const ROUND_RESULTS = {
  pending: "Waiting for the result",
  passed: "Passed",
  failed: "Didn't pass",
  cancelled: "Cancelled",
} as const;
export const OFFER_DECISIONS = { pending: "Deciding", accepted: "Accepted", declined: "Declined" } as const;

export const followUpSchema = z.object({ applicationId: id, followUpAt: isoTime.nullable() });

export const notesSchema = z.object({ applicationId: id, notes: optionalText(5_000) });

/** Something that happened outside CareerOS ("Sent a follow-up email"), added to the timeline. */
export const timelineNoteSchema = z.object({
  applicationId: id,
  occurredAt: isoTime,
  title: z.string().trim().min(2, "Describe what happened.").max(200, "Keep it under 200 characters."),
  note: optionalText(2_000),
});

export const updateRoundSchema = z.object({
  roundId: id,
  result: z.enum(keys(ROUND_RESULTS)),
  selfRating: z.number().int().min(1).max(5).nullable(),
  notes: optionalText(2_000),
});

export const offerDecisionSchema = z.object({ applicationId: id, decision: z.enum(keys(OFFER_DECISIONS)) });
