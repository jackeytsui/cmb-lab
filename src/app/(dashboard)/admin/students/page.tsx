import { redirect } from "next/navigation";
import Link from "next/link";
import { clerkClient } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { AddUserQuickDialog } from "@/components/admin/AddUserQuickDialog";
import { getActiveStudentsPageData } from "@/lib/active-student-queries";
import { ActiveStudentDataTable } from "@/components/admin/ActiveStudentDataTable";
import { ErrorAlert } from "@/components/ui/error-alert";
import { ChevronRight, Users, Globe, ExternalLink, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { StudentInvitePanel } from "@/components/admin/StudentInvitePanel";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, count, desc, eq, ilike, isNull, or, inArray } from "drizzle-orm";
import { AssignCoachDropdown } from "@/components/admin/AssignCoachDropdown";

/**
 * Admin Students page - displays student data table with server-side
 * filtering, sorting, and pagination driven by URL search params.
 *
 * Features:
 * - Server-side data fetching via getStudentsPageData or getActiveStudentsPageData
 * - URL-driven pagination, sorting, search, and filters
 * - TanStack Table with enriched student rows (tags, progress, last active)
 *
 * Access Control:
 * - Requires coach+ role (coaches need student management access)
 */
export default async function AdminStudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  // Verify user has coach+ role
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  // Parse search params
  const params = await searchParams;
  const tab = (params.tab as string) || "users"; // "ghl" | "users"
  const usersRoleFilter = (params.usersRole as string) || "all"; // "all" | "student" | "coach" | "admin"
  const page = Number(params.page) || 1;
  const pageSize = Number(params.pageSize) || 25;
  const sortBy = (params.sortBy as string) || (tab === "ghl" ? "created" : "createdAt");
  const sortOrder = ((params.sortOrder as string) || "desc") as "asc" | "desc";
  const search = (params.search as string) || "";
  
  // GHL Filters
  const tags = (params.tags as string) || undefined;
  const assignedTo = (params.assignedTo as string) || undefined;
  const country = (params.country as string) || undefined;
  const productLine = (params.productLine as string) || undefined;


  // Fetch enriched student data server-side with error handling
  let ghlResult: Awaited<ReturnType<typeof getActiveStudentsPageData>> | null = null;
  let usersResult:
    | {
        items: Array<{
          id: string;
          name: string | null;
          email: string;
          role: "student" | "coach" | "admin";
          createdAt: Date;
          portalAccessStatus: "active" | "paused" | "expired";
          assignedCoachId?: string | null;
          assignedCoachName?: string | null;
        }>;
        total: number;
      }
    | null = null;
  let coaches: Array<{ id: string; name: string | null; email: string }> = [];
  let dataError: string | null = null;

  try {
    if (tab === "ghl") {
      ghlResult = await getActiveStudentsPageData({
        page,
        pageSize,
        sortBy,
        sortOrder,
        search,
        tags,
        assignedTo,
        country,
        productLine,
      });
    } else if (tab === "users") {
      const roleClause =
        usersRoleFilter === "student" || usersRoleFilter === "coach" || usersRoleFilter === "admin"
          ? eq(users.role, usersRoleFilter)
          : undefined;
      const whereClause = and(
        isNull(users.deletedAt),
        roleClause,
        search
          ? or(ilike(users.email, `%${search}%`), ilike(users.name, `%${search}%`))
          : undefined
      );
      const offset = (page - 1) * pageSize;
      const [items, totalRows, coachRows] = await Promise.all([
        db
          .select({
            id: users.id,
            clerkId: users.clerkId,
            name: users.name,
            email: users.email,
            role: users.role,
            createdAt: users.createdAt,
            assignedCoachId: users.assignedCoachId,
          })
          .from(users)
          .where(whereClause)
          .orderBy(desc(users.createdAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(users).where(whereClause),
        db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(
            and(
              isNull(users.deletedAt),
              eq(users.role, "coach"),
            ),
          )
          .orderBy(users.name),
      ]);
      coaches = coachRows;

      // Build a map of coach IDs to names for resolving assigned coach display
      const coachMap = new Map(coachRows.map((c) => [c.id, c.name || c.email]));

      usersResult = {
        items: await (async () => {
          const clerk = await clerkClient();
          const enriched = await Promise.all(
            items.map(async (item) => {
              let portalAccessStatus: "active" | "paused" | "expired" = "active";
              try {
                const clerkUser = await clerk.users.getUser(item.clerkId);
                const metadata = (clerkUser.publicMetadata ?? {}) as Record<string, unknown>;
                const rawStatus =
                  metadata.cmbPortalAccessStatus === "active" ||
                  metadata.cmbPortalAccessStatus === "paused" ||
                  metadata.cmbPortalAccessStatus === "expired"
                    ? metadata.cmbPortalAccessStatus
                    : metadata.cmbPortalAccessRevoked === true
                      ? "paused"
                      : "active";
                portalAccessStatus = rawStatus;
                if (typeof metadata.cmbCourseEndDate === "string") {
                  const date = new Date(metadata.cmbCourseEndDate);
                  if (!Number.isNaN(date.getTime()) && date.getTime() < Date.now()) {
                    portalAccessStatus = "expired";
                  }
                }
              } catch {
                // Keep default active when metadata is unavailable.
              }
              return {
                id: item.id,
                name: item.name,
                email: item.email,
                role: item.role,
                createdAt: item.createdAt,
                portalAccessStatus,
                assignedCoachId: item.assignedCoachId ?? null,
                assignedCoachName: item.assignedCoachId
                  ? coachMap.get(item.assignedCoachId) ?? null
                  : null,
              };
            })
          );
          return enriched;
        })(),
        total: Number(totalRows[0]?.total ?? 0),
      };
    }
  } catch (err) {
    console.error("Failed to fetch students:", err);
    dataError = "Failed to load student data. Please try refreshing the page.";
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin" className="transition-colors hover:text-foreground">
          Admin
        </Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-foreground">Users</span>
      </nav>

      {/* Page header */}
      <header className="mb-8">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-3xl font-bold">Users</h1>
          </div>
          <AddUserQuickDialog />
        </div>
        <p className="text-muted-foreground">
          Manage users, roles, access, and invitation workflows.
        </p>
      </header>

      <div className="mb-6 flex items-center gap-1 border-b border-border">
        <Link
          href="?tab=ghl"
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
            tab === "ghl"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Globe className="w-4 h-4" />
          Active Students (GHL)
        </Link>
        <Link
          href="?tab=users"
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
            tab === "users"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Users className="w-4 h-4" />
          Users
        </Link>
      </div>
      
      {/* GHL Info Banner */}
      {tab === "ghl" && (
        <div className="mb-6 flex flex-col justify-between gap-4 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-500 dark:text-amber-300" />
            <div>
              <h3 className="text-sm font-medium text-foreground">Read-only View</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                This is a synced snapshot from GoHighLevel and is not real-time live data. Any changes must be made directly in the CRM.
              </p>
            </div>
          </div>
          <a
            href="https://app.gohighlevel.com/v2/location/JOdDwlRF2K16cnIYW9Er/contacts/smart_list/All"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            View All Contacts in GoHighLevel
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      )}

      {/* Error or student data table */}
      {dataError ? (
        <ErrorAlert message={dataError} variant="block" />
      ) : tab === "users" && usersResult ? (
        <section aria-label="All users list">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {[
                { key: "all", label: "All" },
                { key: "student", label: "Students" },
                { key: "coach", label: "Coaches" },
                { key: "admin", label: "Admins" },
              ].map((roleTab) => (
                <Link
                  key={roleTab.key}
                  href={`?tab=users&usersRole=${roleTab.key}`}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    usersRoleFilter === roleTab.key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  )}
                >
                  {roleTab.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Role
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Assigned Coach
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Portal Access
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {usersResult.items.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-sm text-muted-foreground"
                      >
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    usersResult.items.map((user) => (
                      <tr
                        key={user.id}
                        className="border-b border-border/60 hover:bg-muted/30"
                      >
                        <td className="px-4 py-3 text-sm text-foreground">
                          <Link
                            href={`/admin/users/${user.id}`}
                            className="hover:text-primary"
                          >
                            {user.name || user.email.split("@")[0]}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {user.email}
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground capitalize">
                          {user.role}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <AssignCoachDropdown
                            studentId={user.id}
                            currentCoachId={user.assignedCoachId ?? null}
                            currentCoachName={user.assignedCoachName ?? null}
                            coaches={coaches}
                          />
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                              user.portalAccessStatus === "active"
                                ? "bg-emerald-100 text-emerald-700"
                                : user.portalAccessStatus === "paused"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-red-100 text-red-700"
                            )}
                          >
                            {user.portalAccessStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Showing {usersResult.items.length} of {usersResult.total} users.
          </p>
        </section>
      ) : tab === "ghl" && ghlResult ? (
        <section aria-label="GHL Active Student List">
          <ActiveStudentDataTable
            data={ghlResult.students}
            total={ghlResult.total}
            page={page}
            pageSize={pageSize}
            sortBy={sortBy}
            sortOrder={sortOrder}
            search={search}
            filters={{
              tags,
              assignedTo,
              country,
              productLine,
            }}
          />
        </section>
      ) : null}

      <StudentInvitePanel defaultCollapsed />
    </div>
  );
}
