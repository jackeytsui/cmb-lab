/**
 * Push knowledge base schema tables to Neon database
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  console.error("Error: DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function tableExists(tableName) {
  const result = await sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) as exists
  `;
  return result[0].exists;
}

async function enumExists(enumName) {
  const result = await sql`
    SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = ${enumName}) as exists
  `;
  return result[0].exists;
}

async function main() {
  console.log("Pushing knowledge base schema...\n");

  // 1. Create kb_entry_status enum
  if (!(await enumExists("kb_entry_status"))) {
    await sql`CREATE TYPE kb_entry_status AS ENUM ('draft', 'published')`;
    console.log("[+] Created kb_entry_status enum");
  } else {
    console.log("[=] kb_entry_status enum already exists");
  }

  // 2. Create kb_categories table
  if (!(await tableExists("kb_categories"))) {
    await sql`
      CREATE TABLE kb_categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    console.log("[+] Created kb_categories table");
  } else {
    console.log("[=] kb_categories table already exists");
  }

  // 3. Create kb_entries table
  if (!(await tableExists("kb_entries"))) {
    await sql`
      CREATE TABLE kb_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category_id UUID REFERENCES kb_categories(id) ON DELETE SET NULL,
        status kb_entry_status NOT NULL DEFAULT 'published',
        created_by TEXT NOT NULL REFERENCES users(clerk_id) ON DELETE CASCADE,
        updated_by TEXT REFERENCES users(clerk_id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    console.log("[+] Created kb_entries table");
  } else {
    console.log("[=] kb_entries table already exists");
  }

  // 4. Create kb_file_sources table
  if (!(await tableExists("kb_file_sources"))) {
    await sql`
      CREATE TABLE kb_file_sources (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entry_id UUID NOT NULL REFERENCES kb_entries(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        storage_key TEXT NOT NULL,
        processed_at TIMESTAMP,
        chunk_count INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    console.log("[+] Created kb_file_sources table");
  } else {
    console.log("[=] kb_file_sources table already exists");
  }

  // 5. Create kb_chunks table
  if (!(await tableExists("kb_chunks"))) {
    await sql`
      CREATE TABLE kb_chunks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entry_id UUID NOT NULL REFERENCES kb_entries(id) ON DELETE CASCADE,
        file_source_id UUID REFERENCES kb_file_sources(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        metadata TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    console.log("[+] Created kb_chunks table");
  } else {
    console.log("[=] kb_chunks table already exists");
  }

  // Verify
  console.log("\nVerifying KB tables:");
  const tables = ["kb_categories", "kb_entries", "kb_file_sources", "kb_chunks"];
  for (const table of tables) {
    const exists = await tableExists(table);
    console.log("  - " + table + ": " + (exists ? "OK" : "MISSING"));
  }

  console.log("\nKB schema push complete!");
}

main().catch((err) => { console.error("Error:", err); process.exit(1); });
