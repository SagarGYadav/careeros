import {
  Brain,
  Briefcase,
  Building2,
  FileText,
  LayoutDashboard,
  Library,
  MessagesSquare,
  Settings,
  SquareKanban,
  Target,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Flipped to true in the phase that builds the page, so the sidebar never links to unbuilt sections. */
  enabled: boolean;
  /** Extra words the command palette matches on. */
  keywords?: string[];
};

export type NavGroup = { label?: string; items: NavItem[] };

// Information architecture from SPEC §2.
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { title: "Overview", href: "/overview", icon: LayoutDashboard, enabled: true, keywords: ["home", "dashboard"] },
    ],
  },
  {
    label: "Jobs",
    items: [
      { title: "For you", href: "/jobs", icon: Briefcase, enabled: false, keywords: ["feed", "matches"] },
      { title: "Target roles", href: "/jobs/roles", icon: Target, enabled: false },
      { title: "Company sites", href: "/jobs/company-sites", icon: Building2, enabled: false },
    ],
  },
  {
    label: "Track",
    items: [
      { title: "Applications", href: "/applications", icon: SquareKanban, enabled: false, keywords: ["pipeline"] },
      { title: "Interviews", href: "/interviews", icon: MessagesSquare, enabled: false },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { title: "Career intelligence", href: "/intelligence", icon: Brain, enabled: false, keywords: ["insights"] },
      { title: "Resume lab", href: "/resumes", icon: FileText, enabled: false, keywords: ["cv"] },
      { title: "Knowledge base", href: "/knowledge", icon: Library, enabled: false },
    ],
  },
  {
    label: "You",
    items: [
      { title: "Career profile", href: "/profile", icon: UserRound, enabled: false, keywords: ["cv", "skills"] },
      { title: "Settings", href: "/settings", icon: Settings, enabled: true, keywords: ["account", "theme"] },
    ],
  },
];

/** Groups with only the enabled items; empty groups are dropped. */
export function visibleNavGroups(groups: NavGroup[] = NAV_GROUPS): NavGroup[] {
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.enabled) }))
    .filter((group) => group.items.length > 0);
}

/** True when `pathname` is the item's page or one of its sub-pages. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
