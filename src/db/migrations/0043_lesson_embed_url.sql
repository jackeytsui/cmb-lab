-- Add embed_url column to lessons for Google Form / iframe embeds
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS embed_url TEXT;
