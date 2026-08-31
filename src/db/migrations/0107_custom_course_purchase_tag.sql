-- Track a custom-course purchase independently of coaching purchases.
-- This tag intentionally has NO feature/content grants. The specific custom
-- course must be assigned to the individual student. cc_student is the
-- existing Confident Cantonese tag and must not be repurposed.
INSERT INTO tags (name, color, type, description)
SELECT
  'custom_course_student',
  '#8b5cf6',
  'system',
  'Records a Custom course add-on purchase for fulfillment and HighLevel sync. Does not grant access to any course; assign the specific custom course to the individual student.'
WHERE NOT EXISTS (
  SELECT 1 FROM tags WHERE lower(name) = 'custom_course_student'
);
