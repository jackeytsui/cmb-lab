import { redirect } from "next/navigation";
import { hasMinimumRole } from "@/lib/auth";
import { LocationManager } from "./components/LocationManager";
import { FieldMappingTable } from "./components/FieldMappingTable";
import { SyncEventLog } from "./components/SyncEventLog";
import { AutoTagRuleEditor } from "@/components/tags/AutoTagRuleEditor";

/**
 * Admin GHL Integration settings page.
 * Provides location management (multi-sub-account), field mapping CRUD, and sync event log.
 *
 * Access Control:
 * - Requires admin role
 * - Non-admins are redirected to /dashboard
 */
export default async function GhlSettingsPage() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  return (
    <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <p className="mt-2 text-zinc-400">
            Manage CRM connections, field mappings, and sync events.
          </p>
        </div>

        <div className="space-y-8">
          {/* Section 1: GHL Locations (Multi-Sub-Account) */}
          <section>
            <LocationManager />
          </section>

          {/* Section 2: Custom Field Mappings */}
          <section>
            <FieldMappingTable />
          </section>

          {/* Section 3: Auto-Tag Rules */}
          <section>
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-white mb-1">Auto-Tag Rules</h2>
              <p className="text-sm text-zinc-400 mb-4">
                Automatically apply tags based on student activity conditions.
              </p>
              <AutoTagRuleEditor />
            </div>
          </section>

          {/* Section 4: Sync Event Log */}
          <section>
            <SyncEventLog />
          </section>
        </div>
    </div>
  );
}
