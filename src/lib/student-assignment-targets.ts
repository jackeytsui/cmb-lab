import { db } from "@/db";
import { courses, lessons, modules, studentTags } from "@/db/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { canAccessLessonByPolicy } from "@/lib/course-access-policy";
import { resolvePermissions } from "@/lib/permissions";

export type StudentAssignmentTarget = {
  type: "course" | "module" | "lesson" | "student" | "tag";
  id: string;
};

/**
 * Resolve every assignment target that applies to a student.
 *
 * Course targets require full course access. Preview grants only expose the
 * configured preview lessons, while explicit module/lesson grants remain
 * additive. Role grants and direct grants are deliberately handled through
 * the same permission resolver so every assignment surface agrees.
 */
export async function getStudentAssignmentTargets(
  userId: string,
): Promise<StudentAssignmentTarget[]> {
  const targets: StudentAssignmentTarget[] = [];
  const targetKeys = new Set<string>();
  const addTarget = (type: StudentAssignmentTarget["type"], id: string) => {
    const key = `${type}:${id}`;
    if (targetKeys.has(key)) return;
    targetKeys.add(key);
    targets.push({ type, id });
  };

  addTarget("student", userId);

  const [userTags, permissions] = await Promise.all([
    db
      .select({ tagId: studentTags.tagId })
      .from(studentTags)
      .where(eq(studentTags.userId, userId)),
    resolvePermissions(userId),
  ]);

  for (const tag of userTags) addTarget("tag", tag.tagId);

  let accessibleCourseIds = [...permissions.courseIds];
  if (permissions.hasWildcardAccess) {
    const activeCourses = await db
      .select({ id: courses.id })
      .from(courses)
      .where(isNull(courses.deletedAt));
    accessibleCourseIds = activeCourses.map((course) => course.id);
  }

  const accessibleCourses =
    accessibleCourseIds.length > 0
      ? await db.query.courses.findMany({
          where: and(
            inArray(courses.id, accessibleCourseIds),
            isNull(courses.deletedAt),
          ),
          columns: { id: true, previewLessonCount: true },
          with: {
            modules: {
              where: isNull(modules.deletedAt),
              orderBy: [asc(modules.sortOrder)],
              columns: { id: true },
              with: {
                lessons: {
                  where: isNull(lessons.deletedAt),
                  orderBy: [asc(lessons.sortOrder)],
                  columns: { id: true },
                },
              },
            },
          },
        })
      : [];

  for (const course of accessibleCourses) {
    const tier = permissions.hasWildcardAccess
      ? "full"
      : permissions.getCourseLevelAccessTier(course.id);
    const hasCourseLevelAccess = permissions.hasCourseLevelAccess(course.id);
    const isFullCourse = hasCourseLevelAccess && tier === "full";
    if (isFullCourse) addTarget("course", course.id);

    let lessonIndex = 0;
    for (const courseModule of course.modules) {
      const hasModuleGrant = permissions.moduleGrants.has(courseModule.id);
      if (isFullCourse || hasModuleGrant) {
        addTarget("module", courseModule.id);
      }

      for (const lesson of courseModule.lessons) {
        if (
          canAccessLessonByPolicy({
            accessTier: tier,
            hasCourseLevelAccess,
            hasModuleGrant,
            hasLessonGrant: permissions.lessonGrants.has(lesson.id),
            lessonIndex,
            previewLessonCount: course.previewLessonCount,
          })
        ) {
          addTarget("lesson", lesson.id);
        }
        lessonIndex += 1;
      }
    }
  }

  return targets;
}
