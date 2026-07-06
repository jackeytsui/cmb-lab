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

function createDb() {
  const sql = neon(process.env.DATABASE_URL!);
  return drizzle(sql, { schema });
}

let instance: Database | null = null;

export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    instance ??= createDb();
    const value = Reflect.get(instance, prop);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
