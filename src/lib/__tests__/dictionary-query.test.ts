import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { dictionaryFrequencyOrder } from "@/lib/dictionary-query";

describe("dictionaryFrequencyOrder", () => {
  it("renders PostgreSQL direction before NULLS LAST", () => {
    const dialect = new PgDialect();
    const query = dialect.sqlToQuery(dictionaryFrequencyOrder());

    expect(query.sql).toContain('"dictionary_entries"."frequency_rank" ASC NULLS LAST');
    expect(query.sql).not.toContain("NULLS LAST asc");
  });
});
