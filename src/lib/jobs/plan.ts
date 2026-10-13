// Search plan (SPEC §10.4): selected roles' title variants × locations (+ remote), capped per run. Queries are
// interleaved so every role and location gets searched before any gets a second title; the first few are the
// "priority" queries that also go to SerpApi.

export type PlannedQuery = {
  query: string;
  /** A canonical city, "Remote" or the country ("India") when no location is set. */
  location: string;
  priority: boolean;
  roleIds: string[];
};

export type PlanInput = {
  roles: { id: string; titleVariants: string[] }[];
  /** Canonical cities from the preferences ("Remote-India" means remote). */
  locations: string[];
  wantsRemote: boolean;
  maxQueries: number;
  priorityCount: number;
  /** Used when the user has no locations and no remote preference. */
  countryName: string;
};

const VARIANTS_PER_ROLE = 3;

export function buildSearchPlan(input: PlanInput): PlannedQuery[] {
  const places = [
    ...input.locations.filter((l) => l !== "Remote-India"),
    ...(input.wantsRemote || input.locations.includes("Remote-India") ? ["Remote"] : []),
  ];
  const locations = places.length ? places : [input.countryName];
  const byKey = new Map<string, PlannedQuery>();
  const order: string[] = [];

  for (let variant = 0; variant < VARIANTS_PER_ROLE; variant++) {
    for (const location of locations) {
      for (const role of input.roles) {
        const title = role.titleVariants[variant];
        if (!title) continue;
        const key = `${title.toLowerCase()}|${location.toLowerCase()}`;
        const existing = byKey.get(key);
        if (existing) {
          if (!existing.roleIds.includes(role.id)) existing.roleIds.push(role.id);
          continue;
        }
        byKey.set(key, { query: title, location, priority: false, roleIds: [role.id] });
        order.push(key);
      }
    }
  }
  return order
    .slice(0, input.maxQueries)
    .map((key, index) => ({ ...byKey.get(key)!, priority: index < input.priorityCount }));
}
