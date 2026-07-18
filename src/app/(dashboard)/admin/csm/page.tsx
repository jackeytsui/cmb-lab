import { redirect } from "next/navigation";
import { hasMinimumRole, checkRole } from "@/lib/auth";
import { CsmCommandCenter } from "./CsmCommandCenter";

/**
 * Customer Success Command Center.
 *
 * A CSM cockpit that turns the LMS's behavioural signals into a managed
 * customer-success workflow: a portfolio health overview, an at-risk worklist
 * sorted worst-first, per-customer risk signals, and next-best-actions.
 *
 * Access: coach+ (coaches see it as their book of business; admins can also
 * trigger a persisted recompute).
 */
export default async function CsmPage() {
  if (!(await hasMinimumRole("coach"))) redirect("/dashboard");
  const isAdmin = await checkRole("admin");

  return (
    <div className="container mx-auto px-4 py-8">
      <CsmCommandCenter isAdmin={isAdmin} />
    </div>
  );
}
