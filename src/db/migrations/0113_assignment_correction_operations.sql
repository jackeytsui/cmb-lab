ALTER TABLE "assignment_corrections"
ADD COLUMN IF NOT EXISTS "operation" text DEFAULT 'replace' NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'assignment_corrections_operation_check'
  ) THEN
    ALTER TABLE "assignment_corrections"
    ADD CONSTRAINT "assignment_corrections_operation_check"
    CHECK ("operation" IN ('replace', 'delete', 'insert'));
  END IF;
END $$;
