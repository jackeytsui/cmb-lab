import { redirect, notFound } from "next/navigation";
import { hasMinimumRole } from "@/lib/auth";
import { getPracticeSet, listExercises } from "@/lib/practice";
import { BuilderClient } from "./BuilderClient";

interface PageProps {
  params: Promise<{ setId: string }>;
}

export default async function BuilderPage({ params }: PageProps) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  const { setId } = await params;
  const practiceSet = await getPracticeSet(setId);
  if (!practiceSet) {
    notFound();
  }

  const exercises = await listExercises(setId);

  return <BuilderClient practiceSet={practiceSet} initialExercises={exercises} />;
}
