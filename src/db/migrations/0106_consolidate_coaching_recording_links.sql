DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'coaching_sessions'
      AND column_name = 'fathom_link'
  ) THEN
    UPDATE coaching_sessions
    SET recording_url = NULLIF(BTRIM(fathom_link), '')
    WHERE NULLIF(BTRIM(recording_url), '') IS NULL
      AND NULLIF(BTRIM(fathom_link), '') IS NOT NULL;

    ALTER TABLE coaching_sessions DROP COLUMN fathom_link;
  END IF;
END
$$;
