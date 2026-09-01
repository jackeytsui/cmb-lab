ALTER TABLE "announcements"
  ADD COLUMN IF NOT EXISTS "audience_mode" text DEFAULT 'all' NOT NULL;

ALTER TABLE "announcements"
  ADD COLUMN IF NOT EXISTS "audience_tag_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;

ALTER TABLE "announcements"
  ADD COLUMN IF NOT EXISTS "audience_roles" jsonb DEFAULT '[]'::jsonb NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'announcements_audience_mode_check'
  ) THEN
    ALTER TABLE "announcements"
      ADD CONSTRAINT "announcements_audience_mode_check"
      CHECK ("audience_mode" IN ('all', 'targeted'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'announcements_targeted_audience_check'
  ) THEN
    ALTER TABLE "announcements"
      ADD CONSTRAINT "announcements_targeted_audience_check"
      CHECK (
        "audience_mode" = 'all'
        OR jsonb_array_length("audience_tag_ids") > 0
        OR jsonb_array_length("audience_roles") > 0
      );
  END IF;
END $$;
