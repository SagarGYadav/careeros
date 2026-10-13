import { FileQuestion } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <Logo />
      <EmptyState
        className="w-full max-w-md"
        icon={FileQuestion}
        title="Page not found"
        description="The page you're looking for doesn't exist or has moved."
        action={<LinkButton href="/overview">Go to Overview</LinkButton>}
      />
    </main>
  );
}
