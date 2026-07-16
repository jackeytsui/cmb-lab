/**
 * Bulk-apply cmb_student / IC_student tags to all CMB Lab students,
 * driven by each student's tags in GoHighLevel (GHL).
 *
 * Rule (per request):
 *   - If a student's GHL contact carries the "cmb_student" tag  -> assign LMS tag "cmb_student"
 *   - Otherwise (student is in CMB Lab but has no such GHL tag)  -> assign LMS tag "IC_student"
 *
 * Design decisions (confirmed with requester):
 *   - GHL tags are fetched FRESH from the GHL API per linked contact (most accurate).
 *   - Tagging is LMS-only: nothing is written back to GHL, no GHL automations fire.
 *   - The script is DRY-RUN by default. It prints what it *would* do and writes
 *     nothing until you pass `--apply`.
 *
 * "Student" = users.role = 'student' AND users.deleted_at IS NULL.
 *
 * Safety:
 *   - If a student's GHL fetch errors, they are NOT classified (reported as
 *     "errored") so a real cmb_student is never mislabeled IC_student.
 *   - If NO active GHL locations are configured, the script aborts rather than
 *     tagging every student IC_student.
 *   - Assignment is additive and idempotent (ON CONFLICT DO NOTHING); safe to
 *     re-run. Existing tags are left untouched.
 *
 * Usage:
 *   npx tsx src/scripts/bulk-apply-student-tags.ts                 # dry run (default)
 *   npx tsx src/scripts/bulk-apply-student-tags.ts --apply         # perform writes
 *   npx tsx src/scripts/bulk-apply-student-tags.ts --apply --verbose
 *   npx tsx src/scripts/bulk-apply-student-tags.ts --concurrency=8
 *
 * Requires DATABASE_URL (and GHL location API tokens stored in ghl_locations).
 * Loads env from .env.local (like src/db/seed.ts).
 */

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { tags, studentTags, users, ghlContacts, ghlLocations } from "../db/schema";
import { createGhlClient } from "../lib/ghl/client";

// Load environment variables from .env.local
config({ path: ".env.local" });

// --- Config ---

const CMB_TAG = "cmb_student";
const IC_TAG = "IC_student";

// Tag definitions used only when the tag doesn't already exist.
const TAG_DEFS: Record<string, { color: string; description: string }> = {
  [CMB_TAG]: {
    color: "#3b82f6", // blue
    description:
      "Student identified as a CMB student via the cmb_student tag on their GoHighLevel contact.",
  },
  [IC_TAG]: {
    color: "#f59e0b", // amber
    description:
      "In-CMB-Lab student who does NOT carry the cmb_student tag in GoHighLevel. Applied by bulk-apply-student-tags.",
  },
};

// --- CLI args ---

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const VERBOSE = argv.includes("--verbose");
const CONCURRENCY = (() => {
  const arg = argv.find((a) => a.startsWith("--concurrency="));
  const n = arg ? parseInt(arg.split("=")[1], 10) : 5;
  return Number.isFinite(n) && n > 0 ? Math.min(n, 20) : 5;
})();

// --- DB (standalone connection; avoids the `server-only` guard in @/db) ---

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env.local and retry.");
  process.exit(1);
}
const dbSql = neon(process.env.DATABASE_URL);
const db = drizzle(dbSql, { schema });

// --- Types ---

type Classification = "cmb_student" | "IC_student" | "errored";

interface StudentRecord {
  id: string;
  email: string;
  name: string | null;
}

// --- Helpers ---

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Ensure a tag exists; return its id. In dry-run mode, returns the existing id
 * or null (without creating) so no writes happen.
 */
async function ensureTag(name: string): Promise<string | null> {
  const existing = await db
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.name, name))
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  if (!APPLY) {
    console.log(`  (dry-run) tag "${name}" does not exist yet — would create it.`);
    return null;
  }

  const def = TAG_DEFS[name];
  const [created] = await db
    .insert(tags)
    .values({
      name,
      color: def.color,
      type: "system",
      description: def.description,
    })
    .returning({ id: tags.id });

  console.log(`  Created tag "${name}" (id: ${created.id}).`);
  return created.id;
}

/** Map each async worker over items with bounded concurrency, preserving order. */
async function mapPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function run() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

// --- Main ---

async function main() {
  console.log("=".repeat(64));
  console.log("Bulk-apply student tags from GHL");
  console.log(
    `Mode: ${APPLY ? "APPLY (writes enabled)" : "DRY-RUN (no writes)"}  |  concurrency: ${CONCURRENCY}`
  );
  console.log("=".repeat(64));

  // 1. Active GHL locations -> per-location API client
  const locations = await db
    .select({ id: ghlLocations.ghlLocationId, apiToken: ghlLocations.apiToken })
    .from(ghlLocations)
    .where(eq(ghlLocations.isActive, true));

  if (locations.length === 0) {
    console.error(
      "\nNo active GHL locations configured. Aborting to avoid tagging every student IC_student.\n" +
        "Configure at least one active row in ghl_locations, or verify your DATABASE_URL points at the right database."
    );
    process.exit(1);
  }
  const clientByLocation = new Map(
    locations.map((l) => [l.id, createGhlClient(l.apiToken)])
  );
  console.log(`Active GHL locations: ${locations.length}`);

  // 2. All students (role=student, not soft-deleted)
  const students: StudentRecord[] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(and(sql`${users.role} = 'student'`, isNull(users.deletedAt)));

  console.log(`Students in CMB Lab: ${students.length}`);
  if (students.length === 0) {
    console.log("Nothing to do.");
    process.exit(0);
  }

  // 3. Active GHL contact links for those students
  const studentIds = students.map((s) => s.id);
  const linkRows: { userId: string; ghlContactId: string; ghlLocationId: string }[] =
    [];
  for (const idBatch of chunk(studentIds, 1000)) {
    const rows = await db
      .select({
        userId: ghlContacts.userId,
        ghlContactId: ghlContacts.ghlContactId,
        ghlLocationId: ghlContacts.ghlLocationId,
      })
      .from(ghlContacts)
      .where(
        and(
          inArray(ghlContacts.userId, idBatch),
          eq(ghlContacts.syncStatus, "active")
        )
      );
    linkRows.push(...rows);
  }

  const linksByUser = new Map<
    string,
    { ghlContactId: string; ghlLocationId: string }[]
  >();
  for (const r of linkRows) {
    const list = linksByUser.get(r.userId) ?? [];
    list.push({ ghlContactId: r.ghlContactId, ghlLocationId: r.ghlLocationId });
    linksByUser.set(r.userId, list);
  }
  console.log(
    `Students with an active GHL contact link: ${linksByUser.size} ` +
      `(no-link students -> IC_student by definition)\n`
  );

  // 4. Classify each student by fetching fresh GHL tags
  let done = 0;
  const classifications = await mapPool(students, CONCURRENCY, async (student) => {
    const links = linksByUser.get(student.id) ?? [];
    let classification: Classification;
    let ghlTagsSeen: string[] = [];

    if (links.length === 0) {
      // No GHL contact at all -> cannot have cmb_student in GHL.
      classification = "IC_student";
    } else {
      let hadError = false;
      let hasCmb = false;
      for (const link of links) {
        const client = clientByLocation.get(link.ghlLocationId);
        if (!client) {
          // Linked location is inactive/unknown -> treat as unknown, not a miss.
          hadError = true;
          continue;
        }
        try {
          const res = await client.get<{ contact: { tags?: string[] } }>(
            `/contacts/${link.ghlContactId}`
          );
          const ghlTags = res.data.contact.tags ?? [];
          ghlTagsSeen = ghlTagsSeen.concat(ghlTags);
          if (
            ghlTags.some((t) => t.trim().toLowerCase() === CMB_TAG.toLowerCase())
          ) {
            hasCmb = true;
          }
        } catch (err) {
          hadError = true;
          console.error(
            `  ! GHL fetch failed for ${student.email} (contact ${link.ghlContactId}): ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }

      if (hasCmb) classification = "cmb_student";
      else if (hadError) classification = "errored"; // don't risk mislabeling
      else classification = "IC_student";
    }

    done++;
    if (VERBOSE) {
      const tagPreview =
        ghlTagsSeen.length > 0 ? `[${[...new Set(ghlTagsSeen)].join(", ")}]` : "[]";
      console.log(
        `  ${String(done).padStart(5)}/${students.length}  ${classification.padEnd(
          11
        )}  ${student.email}  ${tagPreview}`
      );
    } else if (done % 100 === 0) {
      console.log(`  ...classified ${done}/${students.length}`);
    }

    return { student, classification };
  });

  const cmbUserIds = classifications
    .filter((c) => c.classification === "cmb_student")
    .map((c) => c.student.id);
  const icUserIds = classifications
    .filter((c) => c.classification === "IC_student")
    .map((c) => c.student.id);
  const erroredStudents = classifications
    .filter((c) => c.classification === "errored")
    .map((c) => c.student);

  console.log("\n--- Classification summary ---");
  console.log(`  cmb_student : ${cmbUserIds.length}`);
  console.log(`  IC_student  : ${icUserIds.length}`);
  console.log(`  errored     : ${erroredStudents.length} (not tagged)`);
  if (erroredStudents.length > 0) {
    console.log(
      "  errored emails: " +
        erroredStudents
          .slice(0, 10)
          .map((s) => s.email)
          .join(", ") +
        (erroredStudents.length > 10 ? ", ..." : "")
    );
  }

  // 5. Apply (or preview) the tag assignments
  const cmbTagId = await ensureTag(CMB_TAG);
  const icTagId = await ensureTag(IC_TAG);

  await applyTag(CMB_TAG, cmbTagId, cmbUserIds);
  await applyTag(IC_TAG, icTagId, icUserIds);

  console.log("\n" + "=".repeat(64));
  if (APPLY) {
    console.log("Done. Tags applied.");
  } else {
    console.log("Dry run complete. Re-run with --apply to write these changes.");
  }
  console.log("=".repeat(64));
}

/**
 * Bulk-assign a tag to a set of users (idempotent). Reports newly-assigned vs
 * already-had counts. Writes nothing in dry-run mode.
 */
async function applyTag(
  tagName: string,
  tagId: string | null,
  userIds: string[]
): Promise<void> {
  if (userIds.length === 0) {
    console.log(`\n[${tagName}] no students to tag.`);
    return;
  }

  if (!APPLY) {
    console.log(`\n[${tagName}] (dry-run) would assign to ${userIds.length} students.`);
    return;
  }

  if (!tagId) {
    console.error(`\n[${tagName}] tag id missing — cannot assign. Skipped.`);
    return;
  }

  let newlyAssigned = 0;
  for (const batch of chunk(userIds, 1000)) {
    const inserted = await db
      .insert(studentTags)
      .values(batch.map((userId) => ({ userId, tagId, assignedBy: null })))
      .onConflictDoNothing()
      .returning({ id: studentTags.id });
    newlyAssigned += inserted.length;
  }

  console.log(
    `\n[${tagName}] assigned to ${userIds.length} students ` +
      `(${newlyAssigned} newly added, ${userIds.length - newlyAssigned} already had it).`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nFatal error:", err);
    process.exit(1);
  });
