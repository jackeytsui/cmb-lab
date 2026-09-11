-- Package tags are additive entitlements. The absence of a grant is enough to
-- keep a feature out of a package; a deny on a neutral package tag can
-- accidentally cancel a separate, explicit access tag.
--
-- `ic_student` does not grant Assignment Feedback on its own, but it must not
-- override the dedicated `af_student` grant or the full `cmb_student` grant.
DELETE FROM "tag_feature_grants" AS grant_row
USING "tags" AS tag
WHERE grant_row."tag_id" = tag."id"
  AND tag."name" = 'ic_student'
  AND grant_row."feature_key" = 'assignment_feedback'
  AND grant_row."grant_type" = 'deny';

-- Only replace the seeded description. Preserve wording that an administrator
-- has customized since launch.
UPDATE "tags"
SET
  "description" = 'Inner Circle self-study entitlement: Confident Cantonese Kickstarter and its audio course plus dictionary, flashcards, listening lab, and Lab Assistant. It does not grant coaching material or assignment feedback on its own; another package or access tag can grant those features.',
  "updated_at" = NOW()
WHERE "name" = 'ic_student'
  AND "description" = 'Inner Circle self-study entitlement: Confident Cantonese Kickstarter and its audio course plus dictionary, flashcards, listening lab, and Lab Assistant; coaching material and assignment feedback remain excluded.';
