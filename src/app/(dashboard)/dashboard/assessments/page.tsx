import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AssessmentsClient from "./AssessmentsClient";

export default async function AssessmentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Assessments & Placement</h1>
        <p className="mt-1 text-sm text-zinc-400">Take placement quizzes and HSK mock tests, then view level estimates.</p>
      </div>
      <AssessmentsClient />
    </div>
  );
}
