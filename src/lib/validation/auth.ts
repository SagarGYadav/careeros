import { z } from "zod";

export const signInSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name").max(80, "Keep it under 80 characters"),
    email: z.email("Enter a valid email address"),
    password: z.string().min(10, "Use at least 10 characters").max(128, "Use at most 128 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
export type SignUpInput = z.infer<typeof signUpSchema>;
