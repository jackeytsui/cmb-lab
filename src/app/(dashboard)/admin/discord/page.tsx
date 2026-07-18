import { redirect } from "next/navigation";
import { hasMinimumRole } from "@/lib/auth";
import { DiscordAdminClient } from "./DiscordAdminClient";

/**
 * Admin Discord Community automation page.
 * Status, tag -> role mappings, removal policy, linked members, and audit log.
 *
 * Access Control:
 * - Requires admin role
 * - Non-admins are redirected to /dashboard
 */
export default async function DiscordAdminPage() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Discord Community</h1>
        <p className="mt-2 text-zinc-400">
          Automated student membership: GHL/LMS tags drive Discord invites,
          roles, private channels, and removals. No manual invites needed.
        </p>
      </div>
      <DiscordAdminClient />
    </div>
  );
}
