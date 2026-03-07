import { redirect } from "next/navigation";
import { hasMinimumRole } from "@/lib/auth";
import { PracticeResultsPanel } from "@/components/coach/PracticeResultsPanel";

export default async function CoachPracticeResultsPage() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-2">Practice Results</h1>
      <p className="text-zinc-400 mb-8">
        Review student practice attempts and identify areas for improvement
      </p>
      <PracticeResultsPanel />
    </div>
  );
}
