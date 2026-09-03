-- Additive rollout: preserve every primary coach and grant no new access.
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "additional_coach_ids" uuid[] NOT NULL DEFAULT '{}';
