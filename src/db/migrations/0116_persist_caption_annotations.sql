ALTER TABLE "video_sessions"
  ADD COLUMN IF NOT EXISTS "caption_pinyin" text[],
  ADD COLUMN IF NOT EXISTS "caption_jyutping" text[],
  ADD COLUMN IF NOT EXISTS "caption_english" text[];
