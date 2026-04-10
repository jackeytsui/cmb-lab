import "server-only";
import { db } from "@/db";
import { roles, roleFeatures } from "@/db/schema";
import { assignRole } from "@/lib/user-roles";
import { eq, and, isNull } from "drizzle-orm";

const DEFAULT_STUDENT_ROLE_NAME = "Student";
export const DEFAULT_STUDENT_FEATURES = [
  "dictionary_reader",
  "audio_courses",
  "listening_lab",
  "coaching_material",
  "flashcards",
];

export async function ensureDefaultStudentRole() {
  let role = await db.query.roles.findFirst({
    where: and(eq(roles.name, DEFAULT_STUDENT_ROLE_NAME), isNull(roles.deletedAt)),
  });

  if (!role) {
    const [created] = await db
      .insert(roles)
      .values({
        name: DEFAULT_STUDENT_ROLE_NAME,
        description: "Default student access",
        color: "#0ea5e9",
        isDefault: true,
        sortOrder: 0,
      })
      .returning();

    role = created;
  }

  const existing = await db
    .select({ featureKey: roleFeatures.featureKey })
    .from(roleFeatures)
    .where(eq(roleFeatures.roleId, role.id));

  const existingSet = new Set(existing.map((row) => row.featureKey));
  const missing = DEFAULT_STUDENT_FEATURES.filter(
    (key) => !existingSet.has(key)
  );

  if (missing.length > 0) {
    await db.insert(roleFeatures).values(
      missing.map((featureKey) => ({
        roleId: role.id,
        featureKey,
      }))
    );
  }

  return role;
}

export async function ensureDefaultStudentRoleAssignment(userId: string) {
  const role = await ensureDefaultStudentRole();
  await assignRole(userId, role.id, null);
  return role.id;
}
