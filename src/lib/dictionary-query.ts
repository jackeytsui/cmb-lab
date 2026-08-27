import { sql } from "drizzle-orm";
import { dictionaryEntries } from "@/db/schema";

/** PostgreSQL order expression for common words first and unknown ranks last. */
export function dictionaryFrequencyOrder() {
  return sql`${dictionaryEntries.frequencyRank} ASC NULLS LAST`;
}
