import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { courses, modules, lessons, users, tags } from "@/db/schema";
import { eq, and, isNull, asc } from "drizzle-orm";

const VALID_TARGET_TYPES = ["course", "module", "lesson", "student", "tag"];
const PARENT_REQUIRED_TYPES = ["module", "lesson"];

/**
 * GET /api/admin/assignments/targets?type=...&parentId=...
 * Returns available assignment targets for cascading selects in the assignment dialog.
 * Requires coach role.
 */
export async function GET(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const parentId = searchParams.get("parentId");

    // Validate type parameter
    if (!type || !VALID_TARGET_TYPES.includes(type)) {
      return NextResponse.json(
        {
          error: `type is required and must be one of: ${VALID_TARGET_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Validate parentId for types that require it
    if (PARENT_REQUIRED_TYPES.includes(type) && !parentId) {
      return NextResponse.json(
        { error: `parentId is required for type "${type}"` },
        { status: 400 }
      );
    }

    let targets: unknown[] = [];

    switch (type) {
      case "course": {
        targets = await db
          .select({ id: courses.id, title: courses.title })
          .from(courses)
          .where(isNull(courses.deletedAt))
          .orderBy(asc(courses.title));
        break;
      }
      case "module": {
        targets = await db
          .select({
            id: modules.id,
            title: modules.title,
            courseId: modules.courseId,
          })
          .from(modules)
          .where(
            and(
              eq(modules.courseId, parentId!),
              isNull(modules.deletedAt)
            )
          )
          .orderBy(asc(modules.sortOrder));
        break;
      }
      case "lesson": {
        targets = await db
          .select({
            id: lessons.id,
            title: lessons.title,
            moduleId: lessons.moduleId,
          })
          .from(lessons)
          .where(
            and(
              eq(lessons.moduleId, parentId!),
              isNull(lessons.deletedAt)
            )
          )
          .orderBy(asc(lessons.sortOrder));
        break;
      }
      case "student": {
        targets = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
          })
          .from(users)
          .orderBy(asc(users.name));
        break;
      }
      case "tag": {
        targets = await db
          .select({
            id: tags.id,
            name: tags.name,
            color: tags.color,
          })
          .from(tags)
          .orderBy(asc(tags.name));
        break;
      }
    }

    return NextResponse.json({ targets });
  } catch (error) {
    console.error("Error fetching assignment targets:", error);
    return NextResponse.json(
      { error: "Failed to fetch assignment targets" },
      { status: 500 }
    );
  }
}
