-- Tags are staff-controlled access grants. Automated sources may add grants,
-- but a missing source tag is not permission to revoke access.
UPDATE "tags"
SET "type" = 'coach', "updated_at" = now()
WHERE "type" = 'system';
