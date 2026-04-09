import { redirect } from "next/navigation";
import { hasMinimumRole } from "@/lib/auth";
import { TagAccessClient } from "./TagAccessClient";

export default async function TagAccessPage() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) redirect("/dashboard");

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tag Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create and manage tags, and control what features and content each tag grants or denies.
        </p>
      </div>
      <TagAccessClient />
    </div>
  );
}
