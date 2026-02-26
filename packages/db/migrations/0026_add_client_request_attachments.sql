-- Add attachments support for client portal request submissions.
ALTER TABLE "public"."client_requests"
  ADD COLUMN IF NOT EXISTS "attachments" jsonb NOT NULL DEFAULT '[]'::jsonb;
