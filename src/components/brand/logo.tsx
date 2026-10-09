import { cn } from "@/lib/utils";

/** CareerOS logo mark: an upward path through three nodes (career progression). Inherits the text colour. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={cn("size-6", className)}>
      <rect width="24" height="24" rx="6" className="fill-foreground" />
      <path
        d="M6.5 16.5 10.5 12l3 2.5 4-6"
        className="stroke-background"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17.5" cy="8.5" r="1.6" className="fill-background" />
    </svg>
  );
}

export function Logo({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      {showWordmark && <span className="text-[15px] font-semibold tracking-tight">CareerOS</span>}
    </span>
  );
}
