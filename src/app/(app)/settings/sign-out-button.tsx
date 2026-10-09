"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    const { error } = await authClient.signOut();
    if (error) {
      setPending(false);
      toast.error("Couldn't sign out. Please try again.");
      return;
    }
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <Button variant="outline" onClick={signOut} disabled={pending}>
      <LogOut />
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
