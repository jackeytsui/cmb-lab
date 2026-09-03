/**
 * Additive recovery for the GHL -> CMB Lab cleanup sheet.
 *
 * Input JSON shape:
 * { "records": [{ "row": 35, "contactId": "...", "email": "...", "tags": ["cmb_lab", ...] }] }
 *
 * Dry-run by default. Pass --apply to add missing CMB assignments, preserve the
 * sheet grants as staff-overridable force-on records, and add the same tags to
 * every active GHL location. Existing force-off staff overrides always win.
 */

import { readFile } from "node:fs/promises";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../src/db";
import {
  ghlLocations,
  studentTagOverrides,
  studentTags,
  tags,
  users,
} from "../src/db/schema";
import { getGhlClientForLocation } from "../src/lib/ghl/client";

type InputRecord = {
  row?: number;
  contactId?: string;
  email: string;
  tags: string[];
};

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const inputPath = args.find((arg) => !arg.startsWith("--"));
const actorEmailArg = args.find((arg) => arg.startsWith("--actor-email="));
const actorEmail = (
  actorEmailArg?.slice("--actor-email=".length) ||
  "jackey.tsui@thecmblueprint.com"
).trim().toLowerCase();

if (!inputPath) {
  throw new Error(
    "Usage: tsx scripts/reconcile-sheet-access-tags.ts <input.json> [--apply] [--actor-email=email]",
  );
}
const inputFile = inputPath;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeTag(value: string) {
  return value.trim().toLowerCase();
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function main() {
  const parsed = JSON.parse(await readFile(inputFile, "utf8")) as {
    records?: InputRecord[];
  };
  if (!Array.isArray(parsed.records)) {
    throw new Error("Input JSON must contain a records array");
  }

  const byEmail = new Map<string, { contactId: string; rows: number[]; tags: Set<string> }>();
  for (const record of parsed.records) {
    const email = normalizeEmail(record.email ?? "");
    if (!email) continue;
    const entry = byEmail.get(email) ?? {
      contactId: record.contactId?.trim() ?? "",
      rows: [],
      tags: new Set<string>(),
    };
    if (!entry.contactId && record.contactId?.trim()) {
      entry.contactId = record.contactId.trim();
    }
    if (record.row) entry.rows.push(record.row);
    for (const tagName of record.tags ?? []) {
      const normalized = normalizeTag(tagName);
      if (normalized) entry.tags.add(normalized);
    }
    byEmail.set(email, entry);
  }

  const [studentRows, tagRows, assignmentRows, overrideRows, locationRows, actor] =
    await Promise.all([
      db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(and(eq(users.role, "student"), isNull(users.deletedAt))),
      db.select({ id: tags.id, name: tags.name }).from(tags),
      db.select({ userId: studentTags.userId, tagId: studentTags.tagId }).from(studentTags),
      db
        .select({
          userId: studentTagOverrides.userId,
          tagId: studentTagOverrides.tagId,
          isAssigned: studentTagOverrides.isAssigned,
        })
        .from(studentTagOverrides),
      db
        .select({ id: ghlLocations.ghlLocationId, name: ghlLocations.name })
        .from(ghlLocations)
        .where(eq(ghlLocations.isActive, true)),
      db.query.users.findFirst({
        where: and(eq(users.email, actorEmail), eq(users.role, "admin"), isNull(users.deletedAt)),
        columns: { id: true },
      }),
    ]);

  if (apply && !actor) {
    throw new Error(`Active admin actor not found: ${actorEmail}`);
  }

  const studentByEmail = new Map(
    studentRows.map((student) => [normalizeEmail(student.email), student]),
  );
  const tagByName = new Map(tagRows.map((tag) => [normalizeTag(tag.name), tag]));
  const assigned = new Set(
    assignmentRows.map((row) => `${row.userId}:${row.tagId}`),
  );
  const overrideByPair = new Map(
    overrideRows.map((row) => [`${row.userId}:${row.tagId}`, row.isAssigned]),
  );

  const assignmentsToAdd: Array<{ userId: string; tagId: string; assignedBy: string }> = [];
  const overridesToAdd: Array<{
    userId: string;
    tagId: string;
    isAssigned: boolean;
    setBy: string;
  }> = [];
  const forcedOffByEmail = new Map<string, Set<string>>();
  const unmatchedEmails: string[] = [];
  const unknownCmbTags = new Set<string>();
  let alreadyAssigned = 0;
  let existingOverrides = 0;
  let forcedOff = 0;

  for (const [email, record] of byEmail) {
    const student = studentByEmail.get(email);
    if (!student) {
      unmatchedEmails.push(email);
      continue;
    }
    for (const tagName of record.tags) {
      const tag = tagByName.get(tagName);
      if (!tag) {
        // cmb_lab is a GHL enrollment marker, not a CMB feature-access tag.
        if (tagName !== "cmb_lab") unknownCmbTags.add(tagName);
        continue;
      }
      const pair = `${student.id}:${tag.id}`;
      const override = overrideByPair.get(pair);
      if (override === false) {
        const names = forcedOffByEmail.get(email) ?? new Set<string>();
        names.add(tagName);
        forcedOffByEmail.set(email, names);
        forcedOff += 1;
        continue;
      }
      if (assigned.has(pair)) alreadyAssigned += 1;
      else {
        assignmentsToAdd.push({
          userId: student.id,
          tagId: tag.id,
          assignedBy: actor?.id ?? student.id,
        });
      }
      if (override === true) existingOverrides += 1;
      else {
        overridesToAdd.push({
          userId: student.id,
          tagId: tag.id,
          isAssigned: true,
          setBy: actor?.id ?? student.id,
        });
      }
    }
  }

  const summary = {
    mode: apply ? "apply" : "preview",
    sourceRows: parsed.records.length,
    uniqueEmails: byEmail.size,
    matchedStudents: byEmail.size - unmatchedEmails.length,
    unmatchedStudents: unmatchedEmails.length,
    missingCmbAssignments: assignmentsToAdd.length,
    alreadyAssigned,
    newSheetOverrides: overridesToAdd.length,
    existingOverrides,
    forcedOffSkipped: forcedOff,
    unknownCmbTags: [...unknownCmbTags],
    activeGhlLocations: locationRows.length,
    ghlContactsUpdated: 0,
    ghlFailures: 0,
  };

  if (!apply) {
    console.log(JSON.stringify({ ...summary, unmatchedEmails }, null, 2));
    return;
  }

  for (const batch of chunks(assignmentsToAdd, 500)) {
    if (!batch.length) continue;
    await db.insert(studentTags).values(batch).onConflictDoNothing();
  }
  for (const batch of chunks(overridesToAdd, 500)) {
    if (!batch.length) continue;
    await db.insert(studentTagOverrides).values(batch).onConflictDoNothing();
  }

  // Keep GHL traffic deliberately low; each contact needs an upsert plus one
  // idempotent additive tag call per location.
  for (const batch of chunks([...byEmail.entries()], 2)) {
    const settled = await Promise.allSettled(
      batch.flatMap(([email, record]) => {
        if (!studentByEmail.has(email)) return [];
        return locationRows.map(async (location) => {
          const client = await getGhlClientForLocation(location.id);
          try {
            if (!client) throw new Error(`No GHL client for ${location.name}`);
            const upsert = await client.post<{ contact?: { id?: string } }>(
              "/contacts/upsert",
              { locationId: location.id, email, source: "CMB Lab sheet access fallback" },
            );
            const contactId = upsert.data.contact?.id;
            if (!contactId) throw new Error("GHL upsert did not return a contact");
            const forceOff = forcedOffByEmail.get(email) ?? new Set<string>();
            const tagsToAdd = [...record.tags].filter((tagName) => !forceOff.has(tagName));
            if (tagsToAdd.length) {
              await client.post(`/contacts/${contactId}/tags`, { tags: tagsToAdd });
            }
            return { email, location: location.name };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`${email} @ ${location.name}: ${message}`);
          }
        });
      }),
    );
    for (const result of settled) {
      if (result.status === "fulfilled") summary.ghlContactsUpdated += 1;
      else {
        summary.ghlFailures += 1;
        console.error(
          result.reason instanceof Error ? result.reason.message : String(result.reason),
        );
      }
    }
  }

  console.log(JSON.stringify({ ...summary, unmatchedEmails }, null, 2));
  if (summary.ghlFailures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
