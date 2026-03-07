import { redirect } from "next/navigation";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth";
import ExerciseGenerationClient from "./ExerciseGenerationClient";

export default async function ExerciseGenerationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const canManage = await hasMinimumRole("coach");
  if (!canManage) redirect("/dashboard");

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Auto Exercise Generation</h1>
        <p className="mt-1 text-sm text-zinc-400">Generate cloze/reordering/matching/fill-blank exercises from lesson or reader content.</p>
      </div>
      <ExerciseGenerationClient />
    </div>
  );
}
