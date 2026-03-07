import { redirect } from "next/navigation";
import { hasMinimumRole } from "@/lib/auth";
import { AnalyticsDashboard } from "./AnalyticsDashboard";

/**
 * Admin Analytics Dashboard page.
 *
 * Access Control:
 * - Requires admin role
 * - Non-admins are redirected to /dashboard
 */
export default async function AnalyticsPage() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  return (
    <div className="container mx-auto px-4 py-8">
        <AnalyticsDashboard />
    </div>
  );
}
