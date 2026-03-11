"use client";

import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

export function OnboardingWalkthroughCard() {
  const router = useRouter();
  const { user } = useUser();

  const handleStart = () => {
    if (typeof window !== "undefined") {
      const doneKey = `cmb.onboarding.walkthrough.done.v1.${user?.id ?? "anonymous"}`;
      window.localStorage.removeItem(doneKey);
    }
    router.push("/dashboard/reader?onboarding=1");
  };

  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Onboarding Walkthrough
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Run the full guided tour to understand how Canto to Mando Lab works!
      </p>
      <button
        type="button"
        onClick={handleStart}
        className="mt-3 inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 transition-colors"
      >
        Start Walkthrough
      </button>
    </section>
  );
}
