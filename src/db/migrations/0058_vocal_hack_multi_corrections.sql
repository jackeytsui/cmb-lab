-- Vocal Hack: allow MULTIPLE corrected/alternative entries per sentence.
-- Stored as a jsonb array of { chinese, pinyin, english } on the sentence.
-- The legacy single corrected_chinese/pinyin/english columns are kept for
-- backward compatibility (older reviews) and still populated with the first
-- alternative.

ALTER TABLE "assignment_submission_sentences"
  ADD COLUMN IF NOT EXISTS "corrected_alternatives" jsonb;
