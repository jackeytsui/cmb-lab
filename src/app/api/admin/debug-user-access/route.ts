import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { users, studentTags, tags } from "@/db/schema";
import { eq, ilike } from "drizzle-orm";
import { resolvePermissions } from "@/lib/permissions";
import { getUserFeatureTagOverrides, applyFeatureTagOverrides } from "@/lib/tag-feature-access";
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
  });
}
