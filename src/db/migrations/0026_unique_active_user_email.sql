-- Normalize existing emails
UPDATE "users"
SET "email" = lower(trim("email"))
WHERE "email" <> lower(trim("email"));

-- Keep only one active row per email (newest wins), soft-delete older duplicates.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY lower(email)
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM "users"
  WHERE "deleted_at" IS NULL
)
UPDATE "users" u
SET "deleted_at" = now()
FROM ranked r
WHERE u.id = r.id
  AND r.rn > 1;

-- Enforce uniqueness for active users by email.
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_active_unique_idx"
ON "users" ("email")
WHERE "deleted_at" IS NULL;

