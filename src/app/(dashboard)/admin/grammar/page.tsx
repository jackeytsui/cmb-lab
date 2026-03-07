import { redirect } from "next/navigation";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth";
import AdminGrammarClient from "./AdminGrammarClient";

export default async function AdminGrammarPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const canManage = await hasMinimumRole("coach");
  if (!canManage) redirect("/dashboard");

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Admin Grammar Builder</h1>
        <p className="mt-1 text-sm text-zinc-400">Create, AI-draft, and publish grammar patterns by HSK level.</p>
      </div>
      <AdminGrammarClient />
    </div>
  );
}
