/**
 * Apply pending SQL migrations to the database.
 *
 * Why this exists: the Drizzle journal (src/db/migrations/meta/_journal.json)
 * was frozen at 0039, but the team kept adding hand-written, idempotent SQL
 * files (0040+). `drizzle-kit migrate` ignores those, so each new migration had
 * to be run by hand on Neon — and a couple (0051 flashcards, 0054 course map)
 * were missed, breaking production. This runner applies the raw .sql files in
 * order and records what it has applied in an `applied_migrations` table so it
 * never runs a file twice.
 *
 * Safety:
 * - Runs ONLY on Vercel production builds (VERCEL_ENV=production) or when
 *   invoked explicitly with --force / APPLY_MIGRATIONS=1. Preview builds and
 *   local `npm run build` skip it, so they never mutate the database.
 * - Baselines an existing database: if the DB already has the core `users`
 *   table but no tracking table, every migration numbered <= 0045 is marked
 *   as already-applied WITHOUT running it (those early Drizzle migrations are
 *   not idempotent and are already live). A brand-new empty DB instead runs
 *   everything from 0000.
 * - Migrations 0046+ are all idempotent (IF NOT EXISTS / DO-block guards), so
 *   re-running one is harmless even if it was previously applied by hand.
 */

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { neon } from "@neondatabase/serverless";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "src", "db", "migrations");

// Migrations at or below this number are the legacy Drizzle-generated set that
// is already applied on every existing environment and is NOT safe to re-run.
const BASELINE_MAX = 45;

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const FORCE = args.has("--force") || process.env.APPLY_MIGRATIONS === "1";

/**
 * Split a .sql file into individual statements, respecting:
 * - dollar-quoted blocks ($$ ... $$ or $tag$ ... $tag$) — e.g. DO blocks,
 * - single-quoted strings (with '' escapes) and double-quoted identifiers,
 * - line comments (-- ... , including Drizzle's `--> statement-breakpoint`),
 * - block comments (slash-star ... star-slash).
 * The Neon HTTP driver runs one command per call, so we must split first.
 */
function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let i = 0;
  const n = sql.length;

  let inLineComment = false;
  let inBlockComment = false;
  let inSingle = false;
  let inDouble = false;
  let dollarTag = null; // e.g. "$$" or "$func$"

  while (i < n) {
    const ch = sql[i];
    const next = i + 1 < n ? sql[i + 1] : "";

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        current += ch;
      }
      // drop comment characters
      i++;
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      current += ch;
      i++;
      continue;
    }

    if (inSingle) {
      current += ch;
      if (ch === "'") {
        if (next === "'") {
          current += next;
          i += 2;
          continue;
        }
        inSingle = false;
      }
      i++;
      continue;
    }

    if (inDouble) {
      current += ch;
      if (ch === '"') inDouble = false;
      i++;
      continue;
    }

    // Not in any special context.
    if (ch === "-" && next === "-") {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      current += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      current += ch;
      i++;
      continue;
    }
    if (ch === "$") {
      // Try to match an opening dollar-quote tag: $ [ident chars] $
      const match = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }
    if (ch === ";") {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = "";
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

function migrationNumber(filename) {
  const m = /^(\d+)_/.exec(filename);
  return m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
}

async function listMigrationFiles() {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  const files = await listMigrationFiles();

  if (DRY_RUN) {
    console.log(`[migrate] dry run — parsing ${files.length} migration files`);
    let total = 0;
    for (const file of files) {
      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      const statements = splitSqlStatements(sql);
      total += statements.length;
      console.log(`  ${file}: ${statements.length} statement(s)`);
    }
    console.log(`[migrate] parsed OK — ${total} statements total`);
    return;
  }

  if (!FORCE && process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    console.log(
      `[migrate] skipping — VERCEL_ENV="${process.env.VERCEL_ENV}" (migrations run on production deploys only; use --force to override)`,
    );
    return;
  }
  if (!FORCE && !process.env.VERCEL_ENV) {
    console.log(
      "[migrate] skipping — not a Vercel production build and --force not set (safe no-op for local builds)",
    );
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn(
      "[migrate] DATABASE_URL is not set — skipping migrations (build will continue)",
    );
    return;
  }

  const sql = neon(databaseUrl);

  // Tracking table.
  await sql`
    CREATE TABLE IF NOT EXISTS "applied_migrations" (
      "name" text PRIMARY KEY,
      "applied_at" timestamptz NOT NULL DEFAULT now()
    )
  `;

  const appliedRows = await sql`SELECT "name" FROM "applied_migrations"`;
  const applied = new Set(appliedRows.map((r) => r.name));

  // Baseline an existing database on first run so we never re-run the legacy,
  // non-idempotent migrations that are already live.
  if (applied.size === 0) {
    const usersExists = await sql`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users' LIMIT 1
    `;
    if (usersExists.length > 0) {
      const legacy = files.filter((f) => migrationNumber(f) <= BASELINE_MAX);
      for (const file of legacy) {
        await sql`INSERT INTO "applied_migrations" ("name") VALUES (${file})
                  ON CONFLICT ("name") DO NOTHING`;
        applied.add(file);
      }
      console.log(
        `[migrate] baselined existing database — marked ${legacy.length} legacy migrations (<= ${BASELINE_MAX}) as applied`,
      );
    } else {
      console.log("[migrate] empty database detected — applying all migrations from 0000");
    }
  }

  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    console.log("[migrate] no pending migrations — database is up to date");
    return;
  }

  console.log(`[migrate] applying ${pending.length} pending migration(s):`);
  for (const file of pending) {
    const raw = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    const statements = splitSqlStatements(raw);
    console.log(`  → ${file} (${statements.length} statement(s))`);
    try {
      for (const statement of statements) {
        await sql.query(statement);
      }
      await sql`INSERT INTO "applied_migrations" ("name") VALUES (${file})
                ON CONFLICT ("name") DO NOTHING`;
    } catch (err) {
      console.error(`[migrate] FAILED on ${file}:`, err?.message || err);
      throw err;
    }
  }

  console.log(`[migrate] done — applied ${pending.length} migration(s)`);
}

main().catch((err) => {
  console.error("[migrate] migration run failed:", err?.message || err);
  process.exit(1);
});
