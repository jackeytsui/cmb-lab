import { redirect } from "next/navigation";
import { hasMinimumRole } from "@/lib/auth";
import { ReconcileSourceClient } from "./ReconcileSourceClient";

export default async function ReconcileSourcePage() {
  if (!(await hasMinimumRole("admin"))) redirect("/dashboard");

  return (
    <main className="container mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-bold">Source-of-truth reconciliation</h1>
      <p className="mt-2 mb-6 text-sm text-muted-foreground">
        Preview first. Only existing student accounts with exact email matches
        can be updated; this tool never creates users or changes email addresses.
      </p>
      <ReconcileSourceClient />
    </main>
  );
}
