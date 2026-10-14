// robots.txt (RFC 9309): CareerOS reads a page only when the site allows its user agent. The group for
// "careeros" applies if present, else the "*" group; the longest matching rule wins and Allow wins ties.

export const USER_AGENT = "CareerOS/1.0 (personal job search)";
const AGENT_TOKEN = "careeros";

type Rule = { allow: boolean; pattern: string };

function groupsOf(text: string): { agents: string[]; rules: Rule[] }[] {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && current) {
      // An empty Disallow allows everything; it adds no rule.
      if (value) current.rules.push({ allow: key === "allow", pattern: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`).test(path);
}

/** Whether CareerOS may fetch `pathWithQuery` under these robots.txt rules. */
export function robotsAllows(robotsTxt: string, pathWithQuery: string): boolean {
  const groups = groupsOf(robotsTxt);
  const own = groups.filter((g) => g.agents.some((a) => a !== "*" && AGENT_TOKEN.startsWith(a.split("/")[0])));
  const chosen = own.length ? own : groups.filter((g) => g.agents.includes("*"));
  const rules = chosen.flatMap((g) => g.rules).filter((r) => matches(r.pattern, pathWithQuery));
  if (!rules.length) return true;
  rules.sort((a, b) => b.pattern.length - a.pattern.length || Number(b.allow) - Number(a.allow));
  return rules[0].allow;
}
