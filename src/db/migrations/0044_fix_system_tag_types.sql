-- Fix tags created from /admin/tag-access that were incorrectly stored as type 'system'.
-- All access-control tags should be type 'coach' so the SYS badge is not shown.
UPDATE tags SET type = 'coach' WHERE type = 'system';
