// Seed the feature:enable:mandarin_accelerator tag so coaches can find and assign it
// from the admin panel. GHL auto-creates on first webhook, but we want it available
// immediately for manual coach tagging (D-02).
//
// Run: npx tsx src/scripts/seed-accelerator-tag.ts

import { db } from "@/db";
import { tags } from "@/db/schema";
import { eq } from "drizzle-orm";

async function seedAcceleratorTag() {
  const TAG_NAME = "feature:enable:mandarin_accelerator";

  // Check if tag already exists
  const existing = await db
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.name, TAG_NAME))
    .limit(1);

  if (existing.length > 0) {
    console.log(`Tag "${TAG_NAME}" already exists (id: ${existing[0].id}). Skipping.`);
    return;
  }

  // Insert the tag as system type (consistent with GHL-created tags)
  const [created] = await db
    .insert(tags)
    .values({
      name: TAG_NAME,
      color: "#f59e0b", // amber -- visually distinct for LTO access
      type: "system",
      description:
        "Enables Mandarin Accelerator features for LTO students. Assigned automatically via GHL on LTO purchase, or manually by coaches.",
    })
    .returning({ id: tags.id, name: tags.name });

  console.log(`Created tag "${created.name}" (id: ${created.id})`);
}

seedAcceleratorTag()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
