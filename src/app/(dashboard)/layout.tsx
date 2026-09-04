import { cookies } from "next/headers";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { SearchBar } from "@/components/search/SearchBar";
import { NotificationBellClient } from "@/components/notifications/NotificationBellClient";
import { RouteThemeScope } from "@/components/layout/RouteThemeScope";
import type { Roles } from "@/types/globals";
import { db } from "@/db";
import {
  announcements,
  assignmentSubmissions,
  studentTags,
  users,
} from "@/db/schema";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { FEATURE_KEYS, resolvePermissions } from "@/lib/permissions";
import { DEFAULT_STUDENT_FEATURES, ensureDefaultStudentRoleAssignment } from "@/lib/student-role";
import {
  applyFeatureTagOverrides,
  canViewCourseLibrary,
  getUserFeatureTagOverrides,
} from "@/lib/tag-feature-access";
import { ViewAsBanner } from "@/components/admin/ViewAsBanner";
import { LabAssistantWidget } from "@/components/lab-assistant/LabAssistantWidget";
import { StudentContentGuard } from "@/components/layout/StudentContentGuard";
import { composeStudentName } from "@/lib/student-name";
import type { ActiveAnnouncement } from "@/components/announcements/AnnouncementBanner";
import { IgcAnnouncementSlot } from "@/components/announcements/IgcAnnouncementSlot";
import { getIgcCoachingAnnouncement } from "@/lib/group-coaching-announcement";
import { announcementMatchesAudience } from "@/lib/announcement-audience";
import {
  DEFAULT_PLATFORM_ROLE,
  hasFullFeatureAccess,
  filterFeaturesForRole,
} from "@/lib/platform-roles";
import { hasOneOnOneCoachingHistory } from "@/lib/coaching-history-access";
import { portalAccessStatus, setPortalAccess } from "@/lib/portal-access";

export const dynamic = "force-dynamic";

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
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const forcedStudent = process.env.FORCE_STUDENT_MODE === "true";
  let role: Roles | null = forcedStudent ? "student" : null;
  let enabledFeatures: string[] | undefined;

  let dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, userId),
    columns: { id: true, role: true, timezone: true },
  });

  const clerkUser = await currentUser();
  const email = getClerkEmail(clerkUser);
  const metadata = (clerkUser?.publicMetadata ?? {}) as Record<string, unknown>;
  const accessStatus = portalAccessStatus(metadata);
  const isAccessActive = accessStatus === "active";

  if (!isAccessActive) {
    // Revoke sessions, not a temporary lock. This checks the real signed-in user,
    // before View As, so viewing an expired student never blocks their coach/admin.
    if (!clerkUser?.banned || metadata.cmbPortalAccessStatus !== accessStatus) {
      try {
        await setPortalAccess(await clerkClient(), userId, {
          status: accessStatus,
          enforceExisting: true,
          reason: "portal_access_restricted",
        });
      } catch (err) {
        console.error("Failed to block expired/paused sign-in:", err);
      }
    }
    redirect("/sign-in?access=expired");
  }
  if (!dbUser && email) {
    await db
      .insert(users)
      .values({
        clerkId: userId,
        email,
        name: composeStudentName(clerkUser?.firstName, clerkUser?.lastName),
        imageUrl: clerkUser?.imageUrl ?? null,
        role: DEFAULT_PLATFORM_ROLE,
      })
      .onConflictDoNothing({ target: users.clerkId });

    dbUser = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: { id: true, role: true, timezone: true },
    });

    if (dbUser) {
      await ensureDefaultStudentRoleAssignment(dbUser.id);
    }
  }

  if (!role) {
    role = dbUser?.role ?? DEFAULT_PLATFORM_ROLE;
  }

  // "View As" impersonation: admin can view the app as another user
  const cookieStore = await cookies();
  const viewAsUserId = cookieStore.get("view_as_user_id")?.value;
  let viewAsUser: {
    id: string;
    email: string;
    name: string | null;
    role: Roles;
    timezone: string;
  } | null = null;

  if (viewAsUserId && role === "admin") {
    const target = await db.query.users.findFirst({
      where: eq(users.id, viewAsUserId),
      columns: {
        id: true,
        email: true,
        name: true,
        role: true,
        timezone: true,
      },
    });
    if (target) {
      viewAsUser = target;
      // Override role and dbUser for the impersonated user
      role = target.role as Roles;
      dbUser = {
        id: target.id,
        role: target.role,
        timezone: target.timezone,
      };
    }
  }

  if (hasFullFeatureAccess(role)) {
    enabledFeatures = [...FEATURE_KEYS];
  } else if (role === "student") {
    if (dbUser) {
      // Ensure default role is assigned BEFORE resolving permissions
      // so the first request for a new student picks up features correctly
      await ensureDefaultStudentRoleAssignment(dbUser.id);
      const permissions = await resolvePermissions(dbUser.id);
      enabledFeatures = forcedStudent
        ? [...DEFAULT_STUDENT_FEATURES]
        : Array.from(permissions.features);
    } else {
      enabledFeatures = [...DEFAULT_STUDENT_FEATURES];
    }
  } else if (dbUser) {
    enabledFeatures = Array.from((await resolvePermissions(dbUser.id)).features);
  } else {
    enabledFeatures = [];
  }

  if (dbUser && enabledFeatures && !hasFullFeatureAccess(role)) {
    const overrides = await getUserFeatureTagOverrides(dbUser.id);
    const effectiveFeatures = applyFeatureTagOverrides(enabledFeatures, overrides);
    if (
      role === "student" &&
      !effectiveFeatures.has("one_on_one_coaching") &&
      !overrides.deny.has("one_on_one_coaching") &&
      (await hasOneOnOneCoachingHistory(dbUser.id))
    ) {
      effectiveFeatures.add("one_on_one_coaching");
    }
    enabledFeatures = Array.from(effectiveFeatures);
  }

  // Course Library tab is tag-driven, not plan/feature-driven: staff always
  // see it; students only with an explicit grant (tag whitelisting a library
  // course, or a per-student grant). Overrides both role plans and the
  // feature toggles above.
  if (enabledFeatures) {
    const showLibrary = dbUser
      ? await canViewCourseLibrary({ id: dbUser.id, role })
      : false;
    enabledFeatures = showLibrary
      ? Array.from(new Set([...enabledFeatures, "course_library"]))
      : enabledFeatures.filter((f) => f !== "course_library");
  }

  // These independent shell-level reads run together to avoid delaying every
  // dashboard navigation with a query waterfall.
  const assignmentFeedbackPromise = dbUser
    ? db
        .select({ value: count() })
        .from(assignmentSubmissions)
        .where(
          and(
            eq(assignmentSubmissions.studentId, dbUser.id),
            eq(assignmentSubmissions.status, "reviewed"),
            isNull(assignmentSubmissions.studentViewedAt),
          ),
        )
        .then(([unread]) => unread?.value ?? 0)
        .catch(() => 0)
    : Promise.resolve(0);

  const loadActiveAnnouncement = async (): Promise<ActiveAnnouncement | null> => {
    try {
      const announcement =
        (await db.query.announcements.findFirst({
          where: eq(announcements.isActive, true),
          orderBy: [desc(announcements.publishedAt)],
          columns: {
            id: true,
            title: true,
            body: true,
            linkUrl: true,
            linkLabel: true,
            audienceMode: true,
            audienceTagIds: true,
            audienceRoles: true,
          },
        })) ?? null;
      if (!announcement) return null;

      const tagIds =
        announcement.audienceMode === "targeted" &&
        announcement.audienceTagIds.length > 0 &&
        dbUser
          ? (
              await db
                .select({ tagId: studentTags.tagId })
                .from(studentTags)
                .where(eq(studentTags.userId, dbUser.id))
            ).map((row) => row.tagId)
          : [];

      return announcementMatchesAudience(announcement, { role, tagIds })
        ? announcement
        : null;
    } catch {
      // Keep the app usable while the announcement migration is being applied.
      return null;
    }
  };

  const loadCoachingAnnouncement = async (): Promise<ActiveAnnouncement | null> => {
    if (role !== "student" || !dbUser) return null;
    try {
      return await getIgcCoachingAnnouncement(dbUser.id, dbUser.timezone);
    } catch {
      return null;
    }
  };

  const [
    assignmentFeedbackUnread,
    activeAnnouncement,
    activeCoachingAnnouncement,
  ] = await Promise.all([
    assignmentFeedbackPromise,
    loadActiveAnnouncement(),
    loadCoachingAnnouncement(),
  ]);

  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <>
      {role === "student" && <StudentContentGuard />}
      {viewAsUser && (
        <ViewAsBanner
          userName={viewAsUser.name}
          userEmail={viewAsUser.email}
          userRole={viewAsUser.role}
        />
      )}
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar
          role={role}
          enabledFeatures={filterFeaturesForRole(role, enabledFeatures ?? [])}
          assignmentFeedbackUnread={assignmentFeedbackUnread}
          viewAsUser={viewAsUser}
        />
        <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-3 sm:px-4">
          {/* Mobile hamburger - only visible on small screens where sidebar is a drawer */}
          <SidebarTrigger className="size-9 shrink-0 rounded-md text-muted-foreground hover:text-foreground md:hidden" />
          <div className="flex-1" />
          <div className="flex items-center gap-2 sm:gap-3">
            <SearchBar />
            <NotificationBellClient />
          </div>
        </header>
        <IgcAnnouncementSlot
          initialAnnouncement={activeCoachingAnnouncement}
          fallbackAnnouncement={activeAnnouncement}
          pollCoaching={role === "student"}
        />
        <div className="min-w-0 flex-1 overflow-auto">
          <RouteThemeScope>{children}</RouteThemeScope>
        </div>
        </SidebarInset>
        {/* Support is a baseline service for every active signed-in user. */}
        <LabAssistantWidget />
      </SidebarProvider>
    </>
  );
}
