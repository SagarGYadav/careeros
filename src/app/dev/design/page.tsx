import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Inbox } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ConfidenceLabel } from "@/components/confidence-label";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ProgressSteps } from "@/components/progress-steps";
import { TrustBadge } from "@/components/trust-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatLpa, formatMoney, formatPercent, formatSalaryRange } from "@/lib/format";
import { DesignTableDemo } from "./table-demo";
import { DesignInteractiveDemo } from "./interactive-demo";

export const metadata: Metadata = { title: "Design system" };

// Development-only gallery of the shared components (SPEC §21), used for visual checks and screenshots.
export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6">
      <PageHeader
        title="Design system"
        description="Shared components and tokens. Development only."
        action={<Logo />}
      />

      <Section title="Buttons and badges">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Default</Badge>
          <Badge variant="brand">Brand</Badge>
          <Badge variant="success">Applied</Badge>
          <Badge variant="info">Interview</Badge>
          <Badge variant="warning">Follow up</Badge>
          <Badge variant="destructive">Rejected</Badge>
          <Badge variant="outline">Saved</Badge>
        </div>
      </Section>

      <Section title="Trust and confidence">
        <div className="flex flex-wrap items-center gap-2">
          <TrustBadge kind="fact" />
          <TrustBadge kind="calc" />
          <TrustBadge kind="ai" model="gemini-flash" generatedAt="2026-10-09" />
          <TrustBadge kind="external" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConfidenceLabel n={3} />
          <ConfidenceLabel n={12} />
          <ConfidenceLabel n={27} />
          <ConfidenceLabel n={74} />
        </div>
      </Section>

      <Section title="Formatting">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm tabular-nums">
          <dt className="text-muted-foreground">Money (INR)</dt>
          <dd>{formatMoney(1200000)}</dd>
          <dt className="text-muted-foreground">LPA</dt>
          <dd>{formatLpa(1250000)}</dd>
          <dt className="text-muted-foreground">Salary range</dt>
          <dd>
            {formatSalaryRange(800000, 1200000)} · {formatSalaryRange(90000, 120000, "USD")} ·{" "}
            {formatSalaryRange(null, null)}
          </dd>
          <dt className="text-muted-foreground">Percent</dt>
          <dd>{formatPercent(0.2642)}</dd>
          <dt className="text-muted-foreground">Date</dt>
          <dd>{formatDate("2026-10-09")}</dd>
        </dl>
      </Section>

      <Section title="Progress steps">
        <ProgressSteps
          steps={[
            { id: "a", label: "Searching Adzuna", status: "done", detail: "42 jobs" },
            { id: "b", label: "Searching Google Jobs", status: "done", detail: "18 jobs" },
            { id: "c", label: "Reading company career sites", status: "running", detail: "14 of 60 pages" },
            { id: "d", label: "Writing fit reports", status: "pending" },
            { id: "e", label: "Searching Jooble", status: "skipped", detail: "Monthly limit reached" },
          ]}
        />
      </Section>

      <Section title="Empty state">
        <EmptyState
          icon={Inbox}
          title="No jobs yet"
          description="Run your first search to see openings that match your CV."
          action={<Button size="sm">Find jobs</Button>}
        />
      </Section>

      <Section title="Data table">
        <DesignTableDemo />
      </Section>

      <Section title="Feedback">
        <DesignInteractiveDemo />
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}
