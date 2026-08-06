import "server-only";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

// The Neon client is created lazily on first use instead of at module load.
// `next build` imports every route module while collecting page data, which
// previously required DATABASE_URL just to build — breaking Vercel preview
// and CI builds where the variable isn't configured. No query runs during
// build, so deferring construction is behavior-identical at runtime.
type Database = ReturnType<typeof createDb>;

type NeonSql = ReturnType<typeof neon>;

let sqlInstance: NeonSql | null = null;

/**
 * Shared Neon HTTP client for the small number of workflows that need a
 * single, atomic PostgreSQL statement outside Drizzle's query builder.
 *
 * The neon-http Drizzle driver deliberately does not implement interactive
 * `db.transaction(...)` callbacks. Callers should keep atomic work inside one
 * SQL statement (normally a data-modifying CTE) or use `sql.transaction(...)`
 * with a fixed, non-interactive query list.
 */
export function getNeonSql() {
  sqlInstance ??= neon(process.env.DATABASE_URL!);
  return sqlInstance;
}

function createDb() {
  return drizzle(getNeonSql(), { schema });
}

let instance: Database | null = null;

export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    instance ??= createDb();
    const value = Reflect.get(instance, prop);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
