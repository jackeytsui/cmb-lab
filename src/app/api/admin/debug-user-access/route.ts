import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import {
  users,
  studentTags,
  tags,
  tagFeatureGrants,
  tagContentGrants,
  courses,
} from "@/db/schema";
import { and, asc, eq, ilike, inArray, isNull } from "drizzle-orm";
import { resolvePermissions } from "@/lib/permissions";
import {
  getUserFeatureTagOverrides,
  applyFeatureTagOverrides,
  canViewCourseLibrary,
  getUserContentGrants,
  getRestrictedContentIds,
} from "@/lib/tag-feature-access";
import { getStudentContext } from "@/lib/lab-assistant/student-context";
import { DEFAULT_STUDENT_FEATURES } from "@/lib/student-role";
import { isCustomizedTitle } from "@/lib/customized-content";

/**
 * GET /api/admin/debug-user-access?email=jttohk@gmail.com
 * Admin-only diagnostic: shows exactly what features a user has and why.
 */
export async function GET(req: NextRequest) {
  const isAdmin = await hasMinimumRole("admin");
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const email = req.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "email param required" }, { status: 400 });
  }

  // Find user
  const user = await db.query.users.findFirst({
    where: ilike(users.email, email.trim()),
  });

  if (!user) {
    return NextResponse.json({ error: "User not found", email });
  }

  // Get tags assigned to user
  const userTags = await db
    .select({ tagId: studentTags.tagId, tagName: tags.name, tagType: tags.type })
    .from(studentTags)
    .innerJoin(tags, eq(studentTags.tagId, tags.id))
    .where(eq(studentTags.userId, user.id));

  // Get tag overrides
  const overrides = await getUserFeatureTagOverrides(user.id);

  // Get permissions
  const permissions = await resolvePermissions(user.id);
  const baseFeatures = Array.from(permissions.features);

  // Apply overrides
  const finalFeatures = Array.from(applyFeatureTagOverrides(baseFeatures, overrides));

  // Lab Assistant widget: per-tag lab_assistant grants + the exact same
  // visibility computation the dashboard layout uses.
  const tagIds = userTags.map((t) => t.tagId);
  const labAssistantGrants =
    tagIds.length > 0
      ? await db
          .select({
            tagId: tagFeatureGrants.tagId,
            grantType: tagFeatureGrants.grantType,
          })
          .from(tagFeatureGrants)
          .where(
            and(
              inArray(tagFeatureGrants.tagId, tagIds),
              eq(tagFeatureGrants.featureKey, "lab_assistant")
            )
          )
      : [];
  const tagNameById = new Map(userTags.map((t) => [t.tagId, t.tagName]));
  const isStaff = user.role === "admin" || user.role === "coach";

  // Course Library tab (tag/content-grant driven, independent of features)
  const courseLibraryVisible = await canViewCourseLibrary(user);

  // Audio Courses tab — mirror /api/audio-courses' visibility decision per
  // series and explain it, so "student sees 'No audio courses available yet'"
  // is diagnosable in one request.
  const publishedCourses = await db
    .select()
    .from(courses)
    .where(and(isNull(courses.deletedAt), eq(courses.isPublished, true)))
    .orderBy(asc(courses.sortOrder), asc(courses.createdAt));
  const audioSeriesRows = publishedCourses.filter((course) => {
    try {
      const meta = JSON.parse(course.description ?? "{}");
      return meta.audioCourse === true && meta.extraPack !== true;
    } catch {
      return false;
    }
  });
  const [audioGrantedIds, audioRestrictedIds] = await Promise.all([
    getUserContentGrants(user.id, "audio_series"),
    getRestrictedContentIds("audio_series"),
  ]);
  // Which of the user's tags grant which series (names for the report)
  const seriesGrantRows =
    tagIds.length > 0
      ? await db
          .select({
            contentId: tagContentGrants.contentId,
            tagId: tagContentGrants.tagId,
          })
          .from(tagContentGrants)
          .where(
            and(
              eq(tagContentGrants.contentType, "audio_series"),
              inArray(tagContentGrants.tagId, tagIds)
            )
          )
      : [];
  const audioCoursesReport = audioSeriesRows.map((course) => {
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(course.description ?? "{}");
    } catch {
      /* ignore */
    }
    const isCustom = isCustomizedTitle(course.title) || meta.customCourse === true;
    const restricted = audioRestrictedIds.has(course.id);
    const grantingTags = seriesGrantRows
      .filter((g) => g.contentId === course.id)
      .map((g) => tagNameById.get(g.tagId) ?? g.tagId);
    const allowedUserIds: string[] = Array.isArray(meta.allowedUserIds)
      ? (meta.allowedUserIds as string[])
      : [];
    const manuallyGranted = allowedUserIds.includes(user.id);
    const visible =
      isStaff ||
      (!isCustom && !restricted) ||
      audioGrantedIds.has(course.id) ||
      manuallyGranted;
    const reason = isStaff
      ? "staff role — always visible"
      : !isCustom && !restricted
        ? "no tag restrictions on this series — visible to all students"
        : audioGrantedIds.has(course.id)
          ? `granted via tag: ${grantingTags.join(", ") || "(tag)"}`
          : manuallyGranted
            ? "granted manually in the series Visibility editor"
            : isCustom
              ? "customized series — hidden unless granted per-student or via tag"
              : "series is tag-restricted and none of this user's tags grant it";
    return { id: course.id, title: course.title, isCustom, restricted, visible, reason };
  });
  const visibleAudioCount = audioCoursesReport.filter((c) => c.visible).length;

  // Lab Assistant data resolution: run the real gatekeeper and report which
  // allowlisted fields resolved and how (values redacted to presence only).
  let labAssistantFields: Record<string, unknown> | null = null;
  try {
    const context = await getStudentContext(user);
    labAssistantFields = {
      ghlContactLinked: !!context.ghlContactId,
      firstName: context.firstName,
      fields: Object.fromEntries(
        Object.entries(context.fields).map(([concept, value]) => [
          concept,
          value !== null ? "resolved" : "missing",
        ])
      ),
    };
  } catch (error) {
    labAssistantFields = {
      error: error instanceof Error ? error.message : "resolution failed",
    };
  }

  // Clerk-side identity: which Clerk account(s) this email resolves to, every
  // email attached to them, lock state, and portal-access metadata. Catches
  // crossed identities — e.g. a student email attached as a secondary address
  // on a staff account, which makes student portal-expiry metadata (and the
  // dashboard's auto-lock) land on the staff member instead.
  let clerkIdentity: unknown = null;
  try {
    const clerk = await clerkClient();
    const matches = await clerk.users.getUserList({ emailAddress: [email.trim()] });
    clerkIdentity = matches.data.map((cu) => {
      const meta = (cu.publicMetadata ?? {}) as Record<string, unknown>;
      return {
        clerkId: cu.id,
        matchesLmsUser: cu.id === user.clerkId,
        locked: cu.locked ?? false,
        emailAddresses: cu.emailAddresses.map((e) => e.emailAddress),
        portalMetadata: {
          cmbPortalAccessStatus: meta.cmbPortalAccessStatus ?? null,
          cmbPortalAccessRevoked: meta.cmbPortalAccessRevoked ?? null,
          cmbPortalAccessRevokedReason: meta.cmbPortalAccessRevokedReason ?? null,
          cmbCourseEndDate: meta.cmbCourseEndDate ?? null,
        },
      };
    });
  } catch (error) {
    clerkIdentity = {
      error: error instanceof Error ? error.message : "clerk lookup failed",
    };
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      clerkId: user.clerkId,
    },
    clerkIdentity,
    tags: userTags,
    defaultStudentFeatures: DEFAULT_STUDENT_FEATURES,
    baseFeatures,
    tagOverrides: {
      allow: Array.from(overrides.allow),
      deny: Array.from(overrides.deny),
    },
    finalFeatures,
    labAssistant: {
      visible:
        isStaff ||
        finalFeatures.includes("lab_assistant") ||
        courseLibraryVisible,
      reason: isStaff
        ? "staff role — always visible"
        : finalFeatures.includes("lab_assistant")
          ? "granted via the lab_assistant tag feature"
          : courseLibraryVisible
            ? "granted via Course Library whitelist (same whitelist covers the assistant)"
            : labAssistantGrants.some((g) => g.grantType === "deny")
              ? "a tag explicitly DENIES lab_assistant"
              : userTags.length === 0
                ? "user has no tags in the LMS (check GHL tag sync)"
                : "no whitelist found — grant a Course Library course to one of their tags, or toggle 'Lab Assistant (Support Chat)' on the tag in Tag Management",
      grantsOnUserTags: labAssistantGrants.map((g) => ({
        tag: tagNameById.get(g.tagId) ?? g.tagId,
        grantType: g.grantType,
      })),
    },
    courseLibrary: { visible: courseLibraryVisible },
    audioCourses: {
      visibleCount: visibleAudioCount,
      totalPublished: audioCoursesReport.length,
      note:
        visibleAudioCount === 0
          ? userTags.length === 0
            ? "User sees 'No audio courses available yet'. They have NO tags in the LMS — check the GHL contact link/tag sync for this email first."
            : "User sees 'No audio courses available yet'. Their tags don't grant any restricted series — grant one of their tags in Tag Management, or add them in the series Visibility editor."
          : undefined,
      series: audioCoursesReport,
    },
    labAssistantFields,
  });
}
