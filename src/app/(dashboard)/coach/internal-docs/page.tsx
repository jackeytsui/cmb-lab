import { hasMinimumRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CoachInternalDocsClient } from "./CoachInternalDocsClient";

export default async function CoachInternalDocsPage() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) redirect("/dashboard");

  return (
    <div className="mx-auto w-full max-w-none px-4 py-8">
      <CoachInternalDocsClient />
    </div>
  );
}
