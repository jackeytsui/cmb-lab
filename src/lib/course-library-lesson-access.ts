import { db } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryLessonProgress,
  courseLibraryLessons,
  courseLibraryModuleJumpGrants,
  courseLibraryModules,
} from "@/db/schema";
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { visibleCourseStatuses } from "@/lib/course-library-access";
import { getCourseLibraryCourseAccess } from "@/lib/tag-feature-access";
import { hasFullFeatureAccess } from "@/lib/platform-roles";
import { canAccessCourseLibraryModuleByProgress } from "@/lib/course-library-progression";

type CourseLibraryViewer = {
  id: string;
  role?: string | null;
};

type ResolvedModule = {
  courseId: string;
  moduleId: string;
};

async function canAccessResolvedModule(
  user: CourseLibraryViewer,
  target: ResolvedModule,
): Promise<boolean> {
  const canSeeCourse = await getCourseLibraryCourseAccess(user);
  if (!canSeeCourse(target.courseId)) return false;

  // Admins and coaches need to review all course material independent of
  // their personal student progress. View As resolves to the student role, so
  // the student sequence is still faithfully enforced during QA.
  if (hasFullFeatureAccess(user.role)) return true;

  const [jumpGrant] = await db
    .select({ id: courseLibraryModuleJumpGrants.id })
    .from(courseLibraryModuleJumpGrants)
    .where(
      and(
        eq(courseLibraryModuleJumpGrants.userId, user.id),
        eq(courseLibraryModuleJumpGrants.moduleId, target.moduleId),
      ),
    )
    .limit(1);
  if (jumpGrant) return true;

  const modules = await db
    .select({
      id: courseLibraryModules.id,
      lessonCount: count(courseLibraryLessons.id),
      completedCount: count(courseLibraryLessonProgress.completedAt),
    })
    .from(courseLibraryModules)
    .leftJoin(
      courseLibraryLessons,
      and(
        eq(courseLibraryLessons.moduleId, courseLibraryModules.id),
        isNull(courseLibraryLessons.deletedAt),
      ),
    )
    .leftJoin(
      courseLibraryLessonProgress,
      and(
        eq(courseLibraryLessonProgress.lessonId, courseLibraryLessons.id),
        eq(courseLibraryLessonProgress.userId, user.id),
      ),
    )
    .where(
      and(
        eq(courseLibraryModules.courseId, target.courseId),
        isNull(courseLibraryModules.deletedAt),
      ),
    )
    .groupBy(courseLibraryModules.id, courseLibraryModules.sortOrder)
    .orderBy(asc(courseLibraryModules.sortOrder), asc(courseLibraryModules.id));

  return canAccessCourseLibraryModuleByProgress(
    modules,
    target.moduleId,
  );
}

/** Apply course, tag/manual-grant, and roadmap progression rules to a module. */
export async function canUserAccessCourseLibraryModule(
  user: CourseLibraryViewer,
  moduleId: string,
): Promise<boolean> {
  const [moduleRow] = await db
    .select({
      courseId: courseLibraryCourses.id,
      moduleId: courseLibraryModules.id,
    })
    .from(courseLibraryModules)
    .innerJoin(
      courseLibraryCourses,
      eq(courseLibraryModules.courseId, courseLibraryCourses.id),
    )
    .where(
      and(
        eq(courseLibraryModules.id, moduleId),
        isNull(courseLibraryModules.deletedAt),
        isNull(courseLibraryCourses.deletedAt),
        inArray(
          courseLibraryCourses.status,
          visibleCourseStatuses(user.role),
        ),
      ),
    )
    .limit(1);

  return moduleRow ? canAccessResolvedModule(user, moduleRow) : false;
}

/** Apply course, tag/manual-grant, and roadmap progression rules to a lesson. */
export async function canUserAccessCourseLibraryLesson(
  user: CourseLibraryViewer,
  lessonId: string,
): Promise<boolean> {
  const [lesson] = await db
    .select({
      courseId: courseLibraryCourses.id,
      moduleId: courseLibraryModules.id,
    })
    .from(courseLibraryLessons)
    .innerJoin(
      courseLibraryModules,
      eq(courseLibraryLessons.moduleId, courseLibraryModules.id),
    )
    .innerJoin(
      courseLibraryCourses,
      eq(courseLibraryModules.courseId, courseLibraryCourses.id),
    )
    .where(
      and(
        eq(courseLibraryLessons.id, lessonId),
        isNull(courseLibraryLessons.deletedAt),
        isNull(courseLibraryModules.deletedAt),
        isNull(courseLibraryCourses.deletedAt),
        inArray(
          courseLibraryCourses.status,
          visibleCourseStatuses(user.role),
        ),
      ),
    )
    .limit(1);

  return lesson ? canAccessResolvedModule(user, lesson) : false;
}
