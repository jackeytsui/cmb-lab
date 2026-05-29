-- Migration: create internal_docs table for admin-only rich text documents
CREATE TABLE IF NOT EXISTS "internal_docs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "content" jsonb,
  "order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
