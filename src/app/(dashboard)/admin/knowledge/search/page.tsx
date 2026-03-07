import { redirect } from "next/navigation";
import { hasMinimumRole } from "@/lib/auth";
import { SearchPageClient } from "./SearchPageClient";

/**
 * Knowledge Base Search page.
 * Server component wrapper with role check.
 * Requires coach role minimum.
 */
export default async function KnowledgeSearchPage() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  return <SearchPageClient />;
}
