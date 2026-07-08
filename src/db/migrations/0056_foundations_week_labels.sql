-- Backfill recommended week labels for the Foundations course map.
--
-- Sets course_library_modules.week_label by module order (sort_order) to match
-- the roadmap's recommended pacing, so the student map renders the WEEK number
-- tokens. Scoped to the Foundations course only. Idempotent: rank-based, so
-- re-running yields the same result (and the migration runner records it so it
-- runs once regardless).
--
-- Module order (34 modules; "Chapter 5/6: Basic Mandarin II/III" are the two
-- empty placeholders, hence 32 counted stops):
--   1-5   Ch1 Mindset … Ch4 Basic Mandarin I      -> Day 1-3
--   6-10  Personal Introduction … Lesson 2         -> Week 1
--   11-15 Sharing Field … Ch5 Basic Mandarin II    -> Week 2
--   16-19 Getting the Bill … Lesson 6              -> Week 3
--   20-24 Grocery Store … Ch6 Basic Mandarin III   -> Week 4
--   25-28 Light Dinner … Lesson 10                 -> Week 5
--   29-34 Work & Stress … Lesson 13                -> Week 6

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY sort_order, created_at, id) AS rn
  FROM course_library_modules
  WHERE course_id = '0a7817cd-0935-44a7-9285-d04308a45b4b'
    AND deleted_at IS NULL
)
UPDATE course_library_modules AS m
SET week_label = CASE
  WHEN r.rn <= 5  THEN 'Day 1-3'
  WHEN r.rn <= 10 THEN 'Week 1'
  WHEN r.rn <= 15 THEN 'Week 2'
  WHEN r.rn <= 19 THEN 'Week 3'
  WHEN r.rn <= 24 THEN 'Week 4'
  WHEN r.rn <= 28 THEN 'Week 5'
  ELSE 'Week 6'
END
FROM ranked r
WHERE m.id = r.id;
