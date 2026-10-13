import Link from "next/link";
import { cn } from "@/lib/utils";

export const PROFILE_SECTIONS = [
  { href: "/profile", label: "Overview" },
  { href: "/profile/details", label: "Details" },
  { href: "/profile/experience", label: "Experience" },
  { href: "/profile/projects", label: "Projects" },
  { href: "/profile/education", label: "Education" },
  { href: "/profile/skills", label: "Skills" },
  { href: "/profile/preferences", label: "Preferences" },
  { href: "/profile/memory", label: "Memory" },
] as const;

export type ProfileSection = (typeof PROFILE_SECTIONS)[number]["href"];

/** Sub-navigation for the Career profile pages. */
export function ProfileNav({ active }: { active: ProfileSection }) {
  return (
    <nav aria-label="Career profile sections" className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max gap-1 border-b px-1">
        {PROFILE_SECTIONS.map((section) => {
          const current = section.href === active;
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-9 items-center border-b-2 px-3 text-sm transition-colors",
                  current
                    ? "border-brand font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
