import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { users, studentTags, tags, tagFeatureGrants } from "@/db/schema";
import { and, eq, ilike, inArray } from "drizzle-orm";
import { resolvePermissions } from "@/lib/permissions";
import {
  getUserFeatureTagOverrides,
  applyFeatureTagOverrides,
  canViewCourseLibrary,
} from "@/lib/tag-feature-access";
import { getStudentContext } from "@/lib/lab-assistant/student-context";
import { DEFAULT_STUDENT_FEATURES } from "@/lib/student-role";

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

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      clerkId: user.clerkId,
    },
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
    labAssistantFields,
  });
}
