import Link from "next/link";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A link that looks like a button. Navigation stays a real link (role "link", opens in a new tab with a modifier
 * key), unlike a <Button> rendered as an anchor, which screen readers announce as a button.
 */
export function LinkButton({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
