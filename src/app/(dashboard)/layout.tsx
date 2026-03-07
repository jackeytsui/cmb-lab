import { cookies } from "next/headers";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { Separator } from "@/components/ui/separator";
import { SearchBar } from "@/components/search/SearchBar";
import { NotificationBellClient } from "@/components/notifications/NotificationBellClient";
import { RouteThemeScope } from "@/components/layout/RouteThemeScope";
import type { Roles } from "@/types/globals";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { FEATURE_KEYS, resolvePermissions } from "@/lib/permissions";
import { DEFAULT_STUDENT_FEATURES, ensureDefaultStudentRoleAssignment } from "@/lib/student-role";
import { resolveRoleFromEmail } from "@/lib/access-control";
import { applyFeatureTagOverrides, getUserFeatureTagOverrides } from "@/lib/tag-feature-access";

export const dynamic = "force-dynamic";

function isPast(date: Date) {
  return date.getTime() < new Date().getTime();
}

function normalizeRole(value: unknown): Roles | null {
  return value === "admin" || value === "coach" || value === "student" ? value : null;
}

function roleFromSessionClaims(sessionClaims: unknown): Roles | null {
  if (!sessionClaims || typeof sessionClaims !== "object") return null;
  const claims = sessionClaims as Record<string, unknown>;
  return (
    normalizeRole((claims.metadata as Record<string, unknown> | undefined)?.role) ||
    normalizeRole((claims.public_metadata as Record<string, unknown> | undefined)?.role) ||
    normalizeRole((claims.publicMetadata as Record<string, unknown> | undefined)?.role) ||
    normalizeRole(claims.role)
  );
}

function getClerkEmail(clerkUser: Awaited<ReturnType<typeof currentUser>>) {
  return (
    clerkUser?.primaryEmailAddress?.emailAddress ||
    clerkUser?.emailAddresses?.[0]?.emailAddress ||
    null
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const forcedStudent = process.env.FORCE_STUDENT_MODE === "true";
  const claimRole = roleFromSessionClaims(sessionClaims);
  let role = (forcedStudent ? "student" : claimRole || null) as Roles | null;
  let enabledFeatures: string[] | undefined;

  let dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, userId),
    columns: { id: true, role: true },
  });

  const clerkUser = await currentUser();
  const email = getClerkEmail(clerkUser);
  const metadata = (clerkUser?.publicMetadata ?? {}) as Record<string, unknown>;
  const rawStatus =
    metadata.cmbPortalAccessStatus === "active" ||
    metadata.cmbPortalAccessStatus === "paused" ||
    metadata.cmbPortalAccessStatus === "expired"
      ? metadata.cmbPortalAccessStatus
      : metadata.cmbPortalAccessRevoked === true
        ? "paused"
        : "active";
  const courseEndDateRaw =
    typeof metadata.cmbCourseEndDate === "string" ? metadata.cmbCourseEndDate : null;
  const courseEndAt = courseEndDateRaw ? new Date(courseEndDateRaw) : null;
  const isCourseEnded =
    courseEndAt instanceof Date &&
    !Number.isNaN(courseEndAt.getTime()) &&
    isPast(courseEndAt);
  const isAccessActive = rawStatus === "active" && !isCourseEnded;

  if (!isAccessActive) {
    // Auto-lock expired students once the end date passes.
    if (isCourseEnded && rawStatus !== "expired" && userId) {
      try {
        const clerk = await clerkClient();
        await clerk.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...metadata,
            cmbPortalAccessRevoked: true,
            cmbPortalAccessStatus: "expired",
            cmbPortalAccessRevokedAt: new Date().toISOString(),
            cmbPortalAccessRevokedReason: "course_end_date_expired",
          },
        });
        await clerk.users.lockUser(userId);
      } catch (err) {
        console.error("Failed to auto-lock expired user:", err);
      }
    }
    redirect("/sign-in?access=expired");
  }
  if (!dbUser && email) {
    const metadataRole = normalizeRole((metadata as Record<string, unknown>)?.role);
    const resolvedRole = (claimRole || metadataRole || resolveRoleFromEmail(email)) as Roles;
    await db
      .insert(users)
      .values({
        clerkId: userId,
        email,
        name:
          [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || null,
        imageUrl: clerkUser?.imageUrl ?? null,
        role: resolvedRole,
      })
      .onConflictDoNothing({ target: users.clerkId });

    dbUser = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: { id: true, role: true },
    });

    if (dbUser && resolvedRole === "student") {
      await ensureDefaultStudentRoleAssignment(dbUser.id);
    }
  } else if (dbUser && email) {
    const metadataRole = normalizeRole((metadata as Record<string, unknown>)?.role);
    const resolvedRole = claimRole || metadataRole || resolveRoleFromEmail(email);
    if (resolvedRole && dbUser.role !== resolvedRole) {
      await db.update(users).set({ role: resolvedRole }).where(eq(users.id, dbUser.id));
      dbUser = { ...dbUser, role: resolvedRole as Roles };
    }
  }

  if (!role) {
    role = (dbUser?.role || "student") as Roles;
  }

  if (role === "student") {
    if (dbUser) {
      const permissions = await resolvePermissions(dbUser.id);
      enabledFeatures = forcedStudent
        ? [...DEFAULT_STUDENT_FEATURES]
        : Array.from(permissions.features);
      await ensureDefaultStudentRoleAssignment(dbUser.id);
    } else {
      enabledFeatures = [...DEFAULT_STUDENT_FEATURES];
    }
  } else {
    enabledFeatures = [...FEATURE_KEYS];
  }

  if (dbUser && enabledFeatures) {
    const overrides = await getUserFeatureTagOverrides(dbUser.id);
    enabledFeatures = Array.from(applyFeatureTagOverrides(enabledFeatures, overrides));
  }

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar role={role} enabledFeatures={enabledFeatures} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
          <Separator
            orientation="vertical"
            className="mr-2 h-4 bg-border"
          />
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <SearchBar />
            <NotificationBellClient />
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          <RouteThemeScope>{children}</RouteThemeScope>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
