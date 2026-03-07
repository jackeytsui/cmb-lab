import { db } from "@/db";
import { tags, studentTags } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { Tag } from "@/db/schema";

// --- Tag CRUD ---

export async function createTag(data: {
  name: string;
  color: string;
  type?: "coach" | "system";
  description?: string;
  createdBy?: string;
}): Promise<Tag> {
  const [tag] = await db
    .insert(tags)
    .values({
      name: data.name,
      color: data.color,
      type: data.type ?? "coach",
      description: data.description,
      createdBy: data.createdBy,
    })
    .returning();

  return tag;
}

export async function getTags(
  filters?: { type?: "coach" | "system" }
): Promise<Tag[]> {
  if (filters?.type) {
    return db
      .select()
      .from(tags)
      .where(eq(tags.type, filters.type));
  }

  return db.select().from(tags);
}

export async function updateTag(
  tagId: string,
  data: { name?: string; color?: string; description?: string }
): Promise<Tag | null> {
  const [updated] = await db
    .update(tags)
    .set(data)
    .where(eq(tags.id, tagId))
    .returning();

  return updated ?? null;
}

export async function deleteTag(tagId: string): Promise<boolean> {
  const deleted = await db
    .delete(tags)
    .where(eq(tags.id, tagId))
    .returning({ id: tags.id });

  return deleted.length > 0;
}

// --- Student Tag Assignment ---

export async function assignTag(
  userId: string,
  tagId: string,
  assignedBy?: string,
  _options?: { source?: "api" | "webhook" | "system" }
): Promise<{ assigned: boolean; tag: Tag }> {
  // First get the tag to return it
  const [tag] = await db
    .select()
    .from(tags)
    .where(eq(tags.id, tagId));

  if (!tag) {
    throw new Error(`Tag not found: ${tagId}`);
  }

  // Insert with ON CONFLICT DO NOTHING for idempotency
  const result = await db
    .insert(studentTags)
    .values({
      userId,
      tagId,
      assignedBy: assignedBy ?? null,
    })
    .onConflictDoNothing()
    .returning();

  // result.length > 0 means a new row was inserted (new assignment)
  return { assigned: result.length > 0, tag };
}

export async function removeTag(
  userId: string,
  tagId: string,
  _options?: { source?: "api" | "webhook" | "system" }
): Promise<{ removed: boolean; tag: Tag | null }> {
  // Get the tag info before removing
  const [tag] = await db
    .select()
    .from(tags)
    .where(eq(tags.id, tagId));

  const deleted = await db
    .delete(studentTags)
    .where(and(eq(studentTags.userId, userId), eq(studentTags.tagId, tagId)))
    .returning({ id: studentTags.id });

  return { removed: deleted.length > 0, tag: tag ?? null };
}

export async function getStudentTags(userId: string): Promise<Tag[]> {
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
      type: tags.type,
      description: tags.description,
      createdBy: tags.createdBy,
      createdAt: tags.createdAt,
      updatedAt: tags.updatedAt,
    })
    .from(studentTags)
    .innerJoin(tags, eq(studentTags.tagId, tags.id))
    .where(eq(studentTags.userId, userId));

  return rows;
}

export async function getStudentsWithTag(
  tagId: string
): Promise<string[]> {
  const rows = await db
    .select({ userId: studentTags.userId })
    .from(studentTags)
    .where(eq(studentTags.tagId, tagId));

  return rows.map((r) => r.userId);
}
