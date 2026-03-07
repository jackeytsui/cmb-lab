import { sql } from "drizzle-orm";
import { studentTags, tags } from "@/db/schema";

// Users with either of these tags are excluded from analytics calculations.
const WHITELIST_TAGS = ["analytics_whitelist", "analytics-whitelist"] as const;

export function excludeWhitelistedUsersSql(userIdExpr: unknown) {
  return sql`NOT EXISTS (
    SELECT 1
    FROM ${studentTags} st
    INNER JOIN ${tags} t ON st.tag_id = t.id
    WHERE st.user_id = ${userIdExpr}
      AND lower(t.name) IN (${WHITELIST_TAGS[0]}, ${WHITELIST_TAGS[1]})
  )`;
}

