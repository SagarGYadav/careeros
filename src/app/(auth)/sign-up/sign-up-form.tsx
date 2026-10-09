"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type FieldPath } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { DEFAULT_SIGNED_IN_PATH } from "@/lib/safe-redirect";
import { signUpSchema, type SignUpInput } from "@/lib/validation/auth";

const FIELDS: { name: FieldPath<SignUpInput>; label: string; type: string; autoComplete: string; hint?: string }[] = [
  { name: "name", label: "Name", type: "text", autoComplete: "name" },
  { name: "email", label: "Email", type: "email", autoComplete: "email" },
  {
    name: "password",
    label: "Password",
    type: "password",
    autoComplete: "new-password",
    hint: "At least 10 characters.",
  },
  { name: "confirmPassword", label: "Confirm password", type: "password", autoComplete: "new-password" },
];

export function SignUpForm() {
  const router = useRouter();
  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit({ name, email, password }: SignUpInput) {
    const { error } = await authClient.signUp.email({ name, email, password });
    if (error) {
      form.setError("root", {
        message:
          error.status === 429
            ? "Too many attempts. Wait a minute and try again."
            : (error.message ?? "Couldn't create the account. Please try again."),
      });
      return;
    }
    router.replace(DEFAULT_SIGNED_IN_PATH);
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        {FIELDS.map((field) => (
          <Field key={field.name} data-invalid={Boolean(errors[field.name])}>
            <FieldLabel htmlFor={field.name}>{field.label}</FieldLabel>
            <Input
              id={field.name}
              type={field.type}
              autoComplete={field.autoComplete}
              aria-invalid={Boolean(errors[field.name])}
              {...form.register(field.name)}
            />
            {field.hint && !errors[field.name] && <FieldDescription>{field.hint}</FieldDescription>}
            <FieldError errors={[errors[field.name]]} />
          </Field>
        ))}
        {errors.root && (
          <p role="alert" className="text-sm text-destructive">
            {errors.root.message}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </FieldGroup>
    </form>
  );
}
