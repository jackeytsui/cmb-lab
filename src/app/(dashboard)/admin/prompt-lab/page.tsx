import { redirect } from "next/navigation";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth";
import PromptLabClient from "./PromptLabClient";

export default async function PromptLabPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const canManage = await hasMinimumRole("coach");
  if (!canManage) redirect("/dashboard");

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Prompt Testing Lab</h1>
        <p className="mt-1 text-sm text-zinc-400">Run prompt tests, compare A/B outputs, batch-test saved cases, and promote validated prompts.</p>
      </div>
      <PromptLabClient />
    </div>
  );
}
