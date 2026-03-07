import { db } from "@/db";
import {
  studentTags,
  tags,
  courseAccess,
  lessonProgress,
  userRoles,
  roles,
  users,
} from "@/db/schema";
import { eq, sql, inArray, isNull, and, type SQL } from "drizzle-orm";

// --- Types ---

export interface StudentQueryParams {
  page: number;
  pageSize: number;
  sortBy: string; // "name" | "email" | "createdAt" | "lastActive" | "completionPercent"
  sortOrder: "asc" | "desc";
  search?: string;
  tagIds?: string[];
  courseId?: string;
  atRisk?: boolean; // no activity in last 7 days
}

export interface StudentRow {
  id: string;
  clerkId: string;
  email: string;
  name: string | null;
  createdAt: string; // ISO
  coursesEnrolled: number;
  completionPercent: number;
  lastActive: string | null; // ISO
  tags: { id: string; name: string; color: string; type: "coach" | "system" }[];
  roles: { id: string; name: string; color: string; expiresAt: string | null }[];
}

export interface StudentPageResult {
  students: StudentRow[];
  total: number;
}

// --- Query Builder ---

/**
 * Build enriched student page data with sorting, filtering, and pagination.
 * Returns students with coursesEnrolled, completionPercent, lastActive, and tags.
 */
export async function getStudentsPageData(
  params: StudentQueryParams
): Promise<StudentPageResult> {
  const { page, pageSize, sortBy, sortOrder, search, tagIds, courseId, atRisk } =
    params;

  // 1. Build WHERE conditions
  const conditions: SQL[] = [sql`${users.role} = 'student'`];

  if (search) {
    const pattern = `%${search.trim()}%`;
    conditions.push(
      sql`(${users.name} ILIKE ${pattern} OR ${users.email} ILIKE ${pattern})`
    );
  }

  if (tagIds && tagIds.length > 0) {
    conditions.push(
      sql`${users.id} IN (
        SELECT DISTINCT ${studentTags.userId}
        FROM ${studentTags}
        WHERE ${inArray(studentTags.tagId, tagIds)}
      )`
    );
  }

  if (courseId) {
    conditions.push(
      sql`${users.id} IN (
        SELECT DISTINCT ${courseAccess.userId}
        FROM ${courseAccess}
        WHERE ${courseAccess.courseId} = ${courseId}
      )`
    );
  }

  if (atRisk) {
    conditions.push(
      sql`${users.id} NOT IN (
        SELECT DISTINCT ${lessonProgress.userId}
        FROM ${lessonProgress}
        WHERE ${lessonProgress.lastAccessedAt} > NOW() - INTERVAL '7 days'
      )`
    );
  }

  const whereClause = sql.join(conditions, sql` AND `);

  // 2. Build sort expression
  let orderExpression: SQL;
  const dir = sortOrder === "asc" ? "ASC" : "DESC";
  const nullsPosition = sortOrder === "asc" ? "NULLS LAST" : "NULLS FIRST";

  switch (sortBy) {
    case "name":
      orderExpression = sql`${users.name} ${sql.raw(dir)} ${sql.raw(nullsPosition)}`;
      break;
    case "email":
      orderExpression = sql`${users.email} ${sql.raw(dir)}`;
      break;
    case "lastActive":
      orderExpression = sql`(
        SELECT MAX(${lessonProgress.lastAccessedAt})
        FROM ${lessonProgress}
        WHERE ${lessonProgress.userId} = ${users.id}
      ) ${sql.raw(dir)} ${sql.raw(nullsPosition)}`;
      break;
    case "completionPercent":
      // Sort by completion percentage using a subquery
      orderExpression = sql`(
        SELECT CASE
          WHEN COUNT(*) = 0 THEN 0
          ELSE (COUNT(*) FILTER (WHERE "completed_at" IS NOT NULL) * 100 / COUNT(*))
        END
        FROM ${lessonProgress}
        WHERE ${lessonProgress.userId} = ${users.id}
      ) ${sql.raw(dir)}`;
      break;
    case "createdAt":
    default:
      orderExpression = sql`${users.createdAt} ${sql.raw(dir)}`;
      break;
  }

  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0
      ? Math.min(Math.floor(pageSize), 200)
      : 20;
  const offset = (safePage - 1) * safePageSize;

  // 3. Execute count and data queries in parallel
  const [countResult, studentRows] = await Promise.all([
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(users)
      .where(whereClause),
    db
      .select({
        id: users.id,
        clerkId: users.clerkId,
        email: users.email,
        name: users.name,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(whereClause)
      .orderBy(orderExpression)
      .limit(safePageSize)
      .offset(offset),
  ]);

  const total = Number(countResult[0]?.count || 0);

  if (studentRows.length === 0) {
    return { students: [], total };
  }

  const studentIds = studentRows.map((r) => r.id as string);

  // 4. Batch-fetch enrichment data in parallel
  const [tagRows, courseCountRows, progressRows, roleRows] = await Promise.all([
    // Tags for all students
    studentIds.length > 0
      ? db
          .select({
            userId: studentTags.userId,
            tagId: tags.id,
            tagName: tags.name,
            tagColor: tags.color,
            tagType: tags.type,
          })
          .from(studentTags)
          .innerJoin(tags, eq(studentTags.tagId, tags.id))
          .where(inArray(studentTags.userId, studentIds))
      : Promise.resolve([]),

    // Course access counts per student
    studentIds.length > 0
      ? db.execute(
          sql`SELECT "user_id", COUNT(*)::int as course_count
              FROM "course_access"
              WHERE ${inArray(courseAccess.userId, studentIds)}
              GROUP BY "user_id"`
        )
      : Promise.resolve({ rows: [] }),

    // Progress aggregates: completed lessons / total lessons per student, plus last active
    studentIds.length > 0
      ? db.execute(
          sql`SELECT
                "user_id",
                COUNT(*) FILTER (WHERE "completed_at" IS NOT NULL)::int as completed_count,
                COUNT(*)::int as total_count,
                MAX("last_accessed_at") as last_active
              FROM "lesson_progress"
              WHERE ${inArray(lessonProgress.userId, studentIds)}
              GROUP BY "user_id"`
        )
      : Promise.resolve({ rows: [] }),

    // Roles for all students (non-deleted roles only)
    studentIds.length > 0
      ? db
          .select({
            userId: userRoles.userId,
            roleId: roles.id,
            roleName: roles.name,
            roleColor: roles.color,
            expiresAt: userRoles.expiresAt,
          })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .where(
            and(
              inArray(userRoles.userId, studentIds),
              isNull(roles.deletedAt)
            )
          )
      : Promise.resolve([]),
  ]);

  // 5. Build lookup maps
  const tagMap: Record<
    string,
    { id: string; name: string; color: string; type: "coach" | "system" }[]
  > = {};
  for (const row of tagRows) {
    if (!tagMap[row.userId]) {
      tagMap[row.userId] = [];
    }
    tagMap[row.userId].push({
      id: row.tagId,
      name: row.tagName,
      color: row.tagColor,
      type: row.tagType,
    });
  }

  const courseCountMap: Record<string, number> = {};
  for (const row of (courseCountRows as { rows: Record<string, unknown>[] }).rows) {
    courseCountMap[row.user_id as string] = Number(row.course_count);
  }

  const progressMap: Record<
    string,
    { completedCount: number; totalCount: number; lastActive: string | null }
  > = {};
  for (const row of (progressRows as { rows: Record<string, unknown>[] }).rows) {
    progressMap[row.user_id as string] = {
      completedCount: Number(row.completed_count),
      totalCount: Number(row.total_count),
      lastActive: row.last_active
        ? new Date(row.last_active as string).toISOString()
        : null,
    };
  }

  const roleMap: Record<
    string,
    { id: string; name: string; color: string; expiresAt: string | null }[]
  > = {};
  for (const row of roleRows) {
    if (!roleMap[row.userId]) {
      roleMap[row.userId] = [];
    }
    roleMap[row.userId].push({
      id: row.roleId,
      name: row.roleName,
      color: row.roleColor,
      expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
    });
  }

  // 6. Merge into student rows
  const students: StudentRow[] = studentRows.map((row) => {
      const id = row.id;
      const progress = progressMap[id];
      const completionPercent =
        progress && progress.totalCount > 0
          ? Math.round((progress.completedCount / progress.totalCount) * 100)
          : 0;

      return {
        id,
        clerkId: row.clerkId,
        email: row.email,
        name: row.name ?? null,
        createdAt: new Date(row.createdAt).toISOString(),
        coursesEnrolled: courseCountMap[id] ?? 0,
        completionPercent,
        lastActive: progress?.lastActive ?? null,
        tags: tagMap[id] ?? [],
        roles: roleMap[id] ?? [],
      };
    });

  return { students, total };
}
