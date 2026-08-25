-- Seed clear descriptions for the launch tags. Preserve any description an
-- administrator has already written.
UPDATE "tags"
SET "description" = CASE "name"
  WHEN 'whitelisted' THEN 'Approved legacy/exception access profile: core Blueprint courses, audio courses, coaching material, dictionary, flashcards, listening lab, and certificates; accelerator add-ons remain excluded.'
  WHEN 'LTO_student' THEN 'Mandarin Accelerator student profile. Grants the Accelerator while excluding unrelated Blueprint, coaching, AI, certificate, practice-set, and video-thread areas.'
  WHEN 'LTO_ob_audio' THEN 'Mandarin Accelerator onboarding: grants the Audio Accelerator Edition and its onboarding audio series.'
  WHEN 'LTO_ob_tone' THEN 'Mandarin Accelerator onboarding: grants Tone Mastery training.'
  WHEN 'LTO_ob_listen' THEN 'Mandarin Accelerator onboarding: grants Listening Training.'
  WHEN 'cmb_student' THEN 'Canto to Mando Blueprint student entitlement: Blueprint course library and audio courses, assignment feedback, coaching material, dictionary, flashcards, listening lab, and Lab Assistant.'
  WHEN 'ic_student' THEN 'Inner Circle self-study entitlement: Confident Cantonese Kickstarter and its audio course plus dictionary, flashcards, listening lab, and Lab Assistant; coaching material and assignment feedback remain excluded.'
  WHEN '1on1_student' THEN 'Controls student access to the 1:1 Coaching tab.'
  WHEN 'icgc_student' THEN 'Controls student access to Inner Circle and the group coaching schedule.'
  WHEN 'af_student' THEN 'Grants access to assignment feedback.'
  WHEN 'cc_student' THEN 'Identifies Confident Cantonese students for admin targeting and HighLevel sync; this tag currently grants no features by itself.'
  ELSE "description"
END,
"updated_at" = NOW()
WHERE ("description" IS NULL OR btrim("description") = '')
  AND "name" IN (
    'whitelisted',
    'LTO_student',
    'LTO_ob_audio',
    'LTO_ob_tone',
    'LTO_ob_listen',
    'cmb_student',
    'ic_student',
    '1on1_student',
    'icgc_student',
    'af_student',
    'cc_student'
  );

-- HighLevel's supported contact fields are the authoritative progress source.
-- The admin GHL field-mapping screen can change these later if HighLevel fields
-- are replaced; ON CONFLICT preserves an existing administrator mapping.
INSERT INTO "ghl_field_mappings"
  ("lms_concept", "ghl_field_id", "ghl_field_name", "is_active")
VALUES
  ('course_progress_level', 'lbgScvT3ddn6phvuGTvp', 'CMBP Level (Which Section is Student On?)', true),
  ('course_progress_lesson_number', 'Mh76IQnWXIMaII9G0ZQY', 'Which Lesson Number is the Student At?', true),
  ('course_progress_foundations_completed_at', 'ml3TeKSRTWkoUg7cPLZL', 'M1 - Foundations Completion Date', true),
  ('course_progress_intermediate_completed_at', 'aR5txixXl1KfhibAUd8g', 'M2 - Intermediate Completion Date', true),
  ('course_progress_advanced_completed_at', 'Nui5Xvoo0ASJvdHS9nNQ', 'M3 - Advanced Completion Date', true)
ON CONFLICT ("lms_concept") DO NOTHING;
