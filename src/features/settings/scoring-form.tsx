"use client";

import { useId, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { resetScoringSettingsAction, saveScoringSettingsAction } from "@/app/(app)/settings/scoring/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  COMPONENT_KEYS,
  COMPONENT_LABELS,
  scoringSettingsSchema,
  type ComponentKey,
  type ScoringSettings,
} from "@/lib/scoring/config";

const COMPONENT_HINTS: Record<ComponentKey, string> = {
  skills: "Required skills count 3×, preferred 1.5×, implied 1×, nice-to-have 0.5×.",
  experience: "Full points when your years are in the asked range.",
  roleAlignment: "Full points for one of your target roles, about half for an adjacent role.",
  location: "Full points when the city and work mode match your preferences.",
  salary: "Full points when the disclosed salary reaches your expected minimum.",
};

const toNumber = (value: unknown) => (value === "" || value === null ? Number.NaN : Number(value));

function NumberField({
  form,
  name,
  label,
  hint,
  error,
}: {
  form: ReturnType<typeof useForm<ScoringSettings>>;
  name: `weights.${ComponentKey}` | "thresholds.apply" | "thresholds.consider";
  label: string;
  hint?: string;
  error?: string;
}) {
  const id = useId();
  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={100}
        step={1}
        className="w-28"
        aria-invalid={Boolean(error) || undefined}
        {...form.register(name, { setValueAs: toNumber })}
      />
      {hint && !error && <FieldDescription>{hint}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}

export function ScoringForm({ defaultValues, isDefault }: { defaultValues: ScoringSettings; isDefault: boolean }) {
  const form = useForm<ScoringSettings>({ resolver: zodResolver(scoringSettingsSchema), defaultValues });
  const [resetting, startReset] = useTransition();
  const weights = useWatch({ control: form.control, name: "weights" });
  const sum = COMPONENT_KEYS.reduce((total, key) => total + (Number(weights?.[key]) || 0), 0);
  const { errors, isSubmitting, isDirty } = form.formState;

  async function onSubmit(values: ScoringSettings) {
    const result = await saveScoringSettingsAction(values);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    form.reset(values);
    toast.success(`Scoring settings saved (version ${result.data.version}). New analyses use them.`);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">Points for each part of the Fit score</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {COMPONENT_KEYS.map((key) => (
            <NumberField
              key={key}
              form={form}
              name={`weights.${key}`}
              label={COMPONENT_LABELS[key]}
              hint={COMPONENT_HINTS[key]}
              error={errors.weights?.[key]?.message}
            />
          ))}
        </div>
        <p className={sum === 100 ? "text-sm text-muted-foreground" : "text-sm text-destructive"} aria-live="polite">
          Total: <span className="font-medium tabular-nums">{sum}</span> of 100
        </p>
        {errors.weights?.root?.message && <p className="text-sm text-destructive">{errors.weights.root.message}</p>}
        {errors.weights?.message && <p className="text-sm text-destructive">{errors.weights.message}</p>}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">Recommendation thresholds</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            form={form}
            name="thresholds.apply"
            label="Apply at or above"
            hint="With no blockers. One blocker lowers it to Consider."
            error={errors.thresholds?.apply?.message}
          />
          <NumberField
            form={form}
            name="thresholds.consider"
            label="Consider at or above"
            hint="Below this, or with blockers, a job is low priority."
            error={errors.thresholds?.consider?.message}
          />
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? "Saving…" : "Save settings"}
        </Button>
        {!isDefault && (
          <Button
            type="button"
            variant="outline"
            disabled={resetting || isSubmitting}
            onClick={() =>
              startReset(async () => {
                const result = await resetScoringSettingsAction();
                if (!result.ok) toast.error(result.message);
                else toast.success("Back to the default scoring.");
              })
            }
          >
            Reset to defaults
          </Button>
        )}
      </div>
    </form>
  );
}
