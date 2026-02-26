-- Add customizable email content fields to invoice_templates
ALTER TABLE "public"."invoice_templates"
  ADD COLUMN IF NOT EXISTS "email_subject" text,
  ADD COLUMN IF NOT EXISTS "email_heading" text,
  ADD COLUMN IF NOT EXISTS "email_body" text,
  ADD COLUMN IF NOT EXISTS "email_button_text" text;
