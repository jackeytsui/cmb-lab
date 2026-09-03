/** Read-only PostgreSQL verification. Uses synthetic CTE rows, never real users.
 * Run: node --env-file=.env.local --import tsx scripts/verify-shared-coach-sql.mts
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
const require = createRequire(import.meta.url);
const { users } = require("../src/db/schema/users") as typeof import("../src/db/schema/users");
const { coachAssignmentUpdate } = require("../src/lib/coach-assignment-change") as typeof import("../src/lib/coach-assignment-change");
const { studentAssignedToCoach } = require("../src/lib/coach-student-sql") as typeof import("../src/lib/coach-student-sql");

const query = neon(process.env.DATABASE_URL!);
const dialect = new PgDialect();
const jane = "10000000-0000-4000-8000-000000000002";
const tiffany = "10000000-0000-4000-8000-000000000003";
const third = "10000000-0000-4000-8000-000000000004";
type Assignment = { primary: string | null; extra: string[] };
const cte = (state: Assignment) => sql`WITH users AS (
  SELECT ${state.primary}::uuid AS assigned_coach_id,
    ${`{${state.extra.join(",")}}`}::uuid[] AS additional_coach_ids
)`;
async function change(state: Assignment, input: Parameters<typeof coachAssignmentUpdate>[0]): Promise<Assignment> {
  const update = coachAssignmentUpdate(input);
  const compiled = dialect.sqlToQuery(sql`${cte(state)} SELECT
    ${"assignedCoachId" in update ? sql`${update.assignedCoachId}::uuid` : users.assignedCoachId} AS primary,
    ${update.additionalCoachIds ?? users.additionalCoachIds} AS extra FROM users`);
  const [row] = await query.query(compiled.sql, compiled.params);
  return row as Assignment;
}
async function canAccess(state: Assignment, id: string) {
  const compiled = dialect.sqlToQuery(sql`${cte(state)} SELECT coalesce(${studentAssignedToCoach(id)}, false) AS allowed FROM users`);
  const [row] = await query.query(compiled.sql, compiled.params);
  return row.allowed;
}

const initial = { primary: jane, extra: [] };
const shared = await change(initial, { addCoachId: tiffany });
assert.deepEqual(shared, { primary: jane, extra: [tiffany] });
assert.equal(await canAccess(shared, jane), true);
assert.equal(await canAccess(shared, tiffany), true);
assert.equal(await canAccess(shared, third), false);
assert.deepEqual(await change(shared, { addCoachId: tiffany }), shared);
assert.deepEqual(await change(shared, { addCoachId: jane }), shared);
const three = await change(shared, { addCoachId: third });
assert.deepEqual(three, { primary: jane, extra: [tiffany, third] });
const removed = await change(three, { removeCoachId: tiffany });
assert.deepEqual(removed, { primary: jane, extra: [third] });
assert.equal(await canAccess(removed, tiffany), false);
assert.equal(await canAccess(removed, jane), true);
assert.equal(await canAccess(removed, third), true);
assert.deepEqual(await change(three, { coachId: tiffany }), { primary: tiffany, extra: [third] });
const noPrimary = await change(shared, { coachId: null });
assert.deepEqual(noPrimary, { primary: null, extra: [tiffany] });
assert.equal(await canAccess(noPrimary, tiffany), true);
assert.equal(await canAccess(noPrimary, jane), false);
assert.deepEqual(await change({ primary: null, extra: [] }, { addCoachId: tiffany }), noPrimary);
console.log("16 shared-coach PostgreSQL checks passed. Read-only synthetic rows; no student data modified.");
