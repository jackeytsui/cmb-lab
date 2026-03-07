/**
 * Push all LMS schema tables to Neon database
 * This script creates all tables in the correct order respecting foreign key dependencies
 */
import { neon } from "@neondatabase/serverless";

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

async function main() {
  console.log("Checking and creating LMS schema tables...\n");

  // 1. Create enums first
  console.log("Step 1: Creating enums...");

  // Check and create role enum
  const roleEnumExists = await sql`
    SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role')
  `;
  if (!roleEnumExists[0].exists) {
    await sql`CREATE TYPE role AS ENUM ('student', 'coach', 'admin')`;
    console.log("  - Created role enum");
  } else {
    console.log("  - role enum already exists");
  }

  // Check and create language_preference enum
  const langPrefEnumExists = await sql`
    SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'language_preference')
  `;
  if (!langPrefEnumExists[0].exists) {
    await sql`CREATE TYPE language_preference AS ENUM ('cantonese', 'mandarin', 'both')`;
    console.log("  - Created language_preference enum");
  } else {
    console.log("  - language_preference enum already exists");
  }

  // Check and create access_tier enum
  const accessTierEnumExists = await sql`
    SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'access_tier')
  `;
  if (!accessTierEnumExists[0].exists) {
    await sql`CREATE TYPE access_tier AS ENUM ('preview', 'full')`;
    console.log("  - Created access_tier enum");
  } else {
    console.log("  - access_tier enum already exists");
  }

  // Check and create granted_by enum
  const grantedByEnumExists = await sql`
    SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'granted_by')
  `;
  if (!grantedByEnumExists[0].exists) {
    await sql`CREATE TYPE granted_by AS ENUM ('purchase', 'admin', 'promotion', 'enrollment_webhook')`;
    console.log("  - Created granted_by enum");
  } else {
    console.log("  - granted_by enum already exists");
  }

  // Check and create interaction_type enum
  const interactionTypeEnumExists = await sql`
    SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interaction_type')
  `;
  if (!interactionTypeEnumExists[0].exists) {
    await sql`CREATE TYPE interaction_type AS ENUM ('fill_blank', 'short_answer')`;
    console.log("  - Created interaction_type enum");
  } else {
    console.log("  - interaction_type enum already exists");
  }

  // Check and create interaction_language enum
  const interactionLangEnumExists = await sql`
    SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interaction_language')
  `;
  if (!interactionLangEnumExists[0].exists) {
    await sql`CREATE TYPE interaction_language AS ENUM ('cantonese', 'mandarin', 'both')`;
    console.log("  - Created interaction_language enum");
  } else {
    console.log("  - interaction_language enum already exists");
  }

  // 2. Create users table
  console.log("\nStep 2: Creating tables...");

  if (!(await tableExists("users"))) {
    await sql`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clerk_id VARCHAR(255) NOT NULL UNIQUE,
        email VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        role role NOT NULL DEFAULT 'student',
        language_preference language_preference NOT NULL DEFAULT 'both',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    console.log("  - Created users table");
  } else {
    console.log("  - users table already exists");
  }

  // 3. Create courses table
  if (!(await tableExists("courses"))) {
    await sql`
      CREATE TABLE courses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug VARCHAR(100) NOT NULL UNIQUE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        thumbnail_url VARCHAR(512),
        is_published BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    console.log("  - Created courses table");
  } else {
    console.log("  - courses table already exists");
  }

  // 4. Create modules table
  if (!(await tableExists("modules"))) {
    await sql`
      CREATE TABLE modules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    console.log("  - Created modules table");
  } else {
    console.log("  - modules table already exists");
  }

  // 5. Create lessons table
  if (!(await tableExists("lessons"))) {
    await sql`
      CREATE TABLE lessons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        mux_playback_id VARCHAR(255),
        mux_asset_id VARCHAR(255),
        duration_seconds INTEGER,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_preview BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    console.log("  - Created lessons table");
  } else {
    console.log("  - lessons table already exists");
  }

  // 6. Create course_access table
  if (!(await tableExists("course_access"))) {
    await sql`
      CREATE TABLE course_access (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        access_tier access_tier NOT NULL DEFAULT 'preview',
        granted_by granted_by NOT NULL DEFAULT 'admin',
        granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMP,
        CONSTRAINT course_access_user_course_unique UNIQUE (user_id, course_id)
      )
    `;
    console.log("  - Created course_access table");
  } else {
    console.log("  - course_access table already exists");
  }

  // 7. Create interactions table
  if (!(await tableExists("interactions"))) {
    await sql`
      CREATE TABLE interactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        type interaction_type NOT NULL,
        language interaction_language NOT NULL DEFAULT 'both',
        prompt TEXT NOT NULL,
        expected_answer TEXT,
        cue_point_seconds NUMERIC(10,3) NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    console.log("  - Created interactions table");
  } else {
    console.log("  - interactions table already exists");
  }

  // 8. Create lesson_progress table
  if (!(await tableExists("lesson_progress"))) {
    await sql`
      CREATE TABLE lesson_progress (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        video_watched_percent INTEGER NOT NULL DEFAULT 0,
        video_completed_at TIMESTAMP,
        interactions_completed INTEGER NOT NULL DEFAULT 0,
        interactions_total INTEGER NOT NULL DEFAULT 0,
        completed_at TIMESTAMP,
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_accessed_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT lesson_progress_user_lesson_unique UNIQUE (user_id, lesson_id)
      )
    `;
    console.log("  - Created lesson_progress table");
  } else {
    console.log("  - lesson_progress table already exists");
  }

  console.log("\nSchema push complete!");

  // Verify all tables exist
  console.log("\nVerifying all LMS tables:");
  const lmsTables = [
    "users",
    "courses",
    "modules",
    "lessons",
    "course_access",
    "interactions",
    "lesson_progress",
  ];

  for (const table of lmsTables) {
    const exists = await tableExists(table);
    console.log(`  - ${table}: ${exists ? "OK" : "MISSING"}`);
  }
}

main().catch(console.error);
