"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FormProvider, useForm, type DefaultValues, type FieldValues, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import type { ActionResultLike } from "./types";

/** A profile section form: the section editors inside, one Save button, a toast with the result. */
export function SectionForm<T extends FieldValues>({
  schema,
  defaultValues,
  action,
  children,
  savedMessage = "Saved.",
}: {
  schema: z.ZodType<T>;
  defaultValues: T;
  action: (values: T) => Promise<ActionResultLike>;
  children: React.ReactNode;
  savedMessage?: string;
}) {
  const form = useForm<T>({
    resolver: zodResolver(schema as never) as unknown as Resolver<T>,
    defaultValues: defaultValues as DefaultValues<T>,
  });
  const { isSubmitting, isDirty } = form.formState;

  async function onSubmit(values: T) {
    const result = await action(values);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    form.reset(values);
    toast.success(savedMessage);
  }

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit, () => toast.error("Some fields need fixing. They're marked in red."))}
        noValidate
        className="space-y-4"
      >
        {children}
        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t bg-background/95 py-3 backdrop-blur">
          {isDirty && <p className="mr-auto text-xs text-muted-foreground">You have unsaved changes.</p>}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
