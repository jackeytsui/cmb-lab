// Seed the LTO_student tag so coaches can find and assign it from the admin panel.
// GHL auto-creates on first webhook, but we want it available immediately for
// manual coach tagging.
//
// Run: npx tsx src/scripts/seed-accelerator-tag.ts

import { db } from "@/db";
import { tags } from "@/db/schema";
import { eq } from "drizzle-orm";

async function seedAcceleratorTag() {
  const TAG_NAME = "LTO_student";

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

  // Insert the tag as system type
  const [created] = await db
    .insert(tags)
    .values({
      name: TAG_NAME,
      color: "#34d399", // minty green
      type: "system",
      description:
        "Exclusive access tag for LTO students. Grants Mandarin Accelerator features and hides regular student content. Assigned via GHL on LTO purchase or manually by coaches.",
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
