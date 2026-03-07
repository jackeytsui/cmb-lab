import { db } from "@/db";
import { activeStudents } from "@/db/schema";
import { sql, ilike, or, asc, desc, count, eq, and } from "drizzle-orm";

export interface ActiveStudentQueryParams {
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  search?: string;
  tags?: string; // Comma separated tags to filter (ILIKE match)
  assignedTo?: string; // Exact match
  country?: string; // Exact match
  productLine?: string; // Exact match
}

export async function getActiveStudentsPageData(params: ActiveStudentQueryParams) {
  const { page, pageSize, sortBy, sortOrder, search, tags, assignedTo, country, productLine } = params;

  // Build where conditions
  const conditions = [];

  if (search) {
    conditions.push(or(
      ilike(activeStudents.firstName, `%${search}%`),
      ilike(activeStudents.lastName, `%${search}%`),
      ilike(activeStudents.email, `%${search}%`)
    ));
  }

  if (tags) {
    // Basic tag filtering: checks if the 'tags' string column contains the substring
    // This is imperfect for comma-separated strings but works for a basic implementation given the schema structure
    const tagList = tags.split(',').filter(Boolean);
    tagList.forEach(tag => {
        conditions.push(ilike(activeStudents.tags, `%${tag}%`));
    });
  }

  if (assignedTo) {
      conditions.push(ilike(activeStudents.assignedTo, `%${assignedTo}%`));
  }

  if (country) {
      conditions.push(eq(activeStudents.country, country));
  }

  if (productLine) {
      conditions.push(ilike(activeStudents.productLine, `%${productLine}%`));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Calculate total count
  const [totalResult] = await db
    .select({ count: count() })
    .from(activeStudents)
    .where(whereClause);
  const total = totalResult.count;

  // Build sort
  let orderBy;
  switch (sortBy) {
    case "name":
      orderBy = sortOrder === "asc" ? asc(activeStudents.firstName) : desc(activeStudents.firstName);
      break;
    case "email":
      orderBy = sortOrder === "asc" ? asc(activeStudents.email) : desc(activeStudents.email);
      break;
    case "created":
      orderBy = sortOrder === "asc" ? asc(activeStudents.created) : desc(activeStudents.created);
      break;
    case "updated":
      orderBy = sortOrder === "asc" ? asc(activeStudents.updated) : desc(activeStudents.updated);
      break;
    case "lastActivity":
       // text field, might not sort correctly if not ISO8601, but best effort
      orderBy = sortOrder === "asc" ? asc(activeStudents.lastActivity) : desc(activeStudents.lastActivity);
      break;
    default:
      orderBy = sortOrder === "asc" ? asc(activeStudents.created) : desc(activeStudents.created);
      break;
  }

  // Fetch data
  const students = await db
    .select()
    .from(activeStudents)
    .where(whereClause)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { students, total };
}

export async function getActiveStudent(contactId: string) {
  const [student] = await db
    .select()
    .from(activeStudents)
    .where(eq(activeStudents.contactId, contactId));
  
  return student;
}
