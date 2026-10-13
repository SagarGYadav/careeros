"use client";

import { useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { savePreferencesAction } from "@/app/(app)/profile/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { preferencesSchema, WORK_MODE_OPTIONS, type PreferencesInput } from "@/lib/validation/profile";
import { numberOrNull, TagsInput } from "./inputs";

function NumberField({
  form,
  name,
  label,
  hint,
  step = "0.1",
}: {
  form: ReturnType<typeof useForm<PreferencesInput>>;
  name: "currentCtcLpa" | "expectedMinLpa" | "expectedMaxLpa" | "noticePeriodDays" | "dealbreakers.maxWfoDaysPerWeek";
  label: string;
  hint?: string;
  step?: string;
}) {
  const id = useId();
  const error =
    name === "dealbreakers.maxWfoDaysPerWeek"
      ? form.formState.errors.dealbreakers?.maxWfoDaysPerWeek
      : form.formState.errors[name];
  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        aria-invalid={Boolean(error) || undefined}
        {...form.register(name, { setValueAs: numberOrNull })}
      />
      {hint && !error && <FieldDescription>{hint}</FieldDescription>}
      {error?.message && <FieldError>{error.message}</FieldError>}
    </Field>
  );
}

function CheckField({
  form,
  name,
  label,
  description,
}: {
  form: ReturnType<typeof useForm<PreferencesInput>>;
  name: "openToRelocate" | "dealbreakers.bond" | "dealbreakers.nightShift" | "dealbreakers.contractToHire";
  label: string;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input id={id} type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" {...form.register(name)} />
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

export function PreferencesForm({ defaultValues }: { defaultValues: PreferencesInput }) {
  const form = useForm<PreferencesInput>({ resolver: zodResolver(preferencesSchema), defaultValues });
  const locationsId = useId();
  const { isSubmitting, isDirty } = form.formState;

  async function onSubmit(values: PreferencesInput) {
    const result = await savePreferencesAction(values);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    form.reset(values);
    toast.success("Preferences saved.");
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle as="h2">Where and how you want to work</CardTitle>
          <CardDescription>
            Job search and matching use these. Leave anything you don&apos;t mind about empty.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field>
            <FieldLabel htmlFor={locationsId}>Preferred locations</FieldLabel>
            <Controller
              control={form.control}
              name="preferredLocations"
              render={({ field }) => (
                <TagsInput
                  id={locationsId}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="e.g. Pune, Bengaluru"
                />
              )}
            />
            <FieldDescription>Press Enter after each city.</FieldDescription>
          </Field>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Work modes</legend>
            <Controller
              control={form.control}
              name="workModes"
              render={({ field }) => (
                <div className="flex flex-wrap gap-4">
                  {WORK_MODE_OPTIONS.map((option) => (
                    <label key={option.value} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--brand)]"
                        checked={field.value.includes(option.value)}
                        onChange={(event) =>
                          field.onChange(
                            event.target.checked
                              ? [...field.value, option.value]
                              : field.value.filter((v) => v !== option.value),
                          )
                        }
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              )}
            />
          </fieldset>
          <CheckField form={form} name="openToRelocate" label="Open to relocating" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Compensation and notice</CardTitle>
          <CardDescription>In lakhs per annum (LPA). Used for salary context in Fit Reports.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <NumberField form={form} name="currentCtcLpa" label="Current CTC (LPA)" />
          <NumberField form={form} name="noticePeriodDays" label="Notice period (days)" step="1" />
          <NumberField form={form} name="expectedMinLpa" label="Expected CTC, minimum (LPA)" />
          <NumberField form={form} name="expectedMaxLpa" label="Expected CTC, maximum (LPA)" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Dealbreakers</CardTitle>
          <CardDescription>Jobs with these conditions are flagged as blockers in Fit Reports.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CheckField
            form={form}
            name="dealbreakers.bond"
            label="Service bond"
            description="A contract that charges you for leaving early."
          />
          <CheckField form={form} name="dealbreakers.nightShift" label="Night or rotational shifts" />
          <CheckField form={form} name="dealbreakers.contractToHire" label="Contract-to-hire" />
          <div className="max-w-xs">
            <NumberField
              form={form}
              name="dealbreakers.maxWfoDaysPerWeek"
              label="Most office days per week you accept"
              hint="Leave empty if you don't mind."
              step="1"
            />
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t bg-background/95 py-3 backdrop-blur">
        {isDirty && <p className="mr-auto text-xs text-muted-foreground">You have unsaved changes.</p>}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save preferences"}
        </Button>
      </div>
    </form>
  );
}
