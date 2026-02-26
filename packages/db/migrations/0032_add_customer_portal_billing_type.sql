ALTER TABLE "customers"
ADD COLUMN IF NOT EXISTS "portal_billing_type" text DEFAULT 'subscription';

ALTER TABLE "customers"
ADD COLUMN IF NOT EXISTS "portal_project_name" text;

ALTER TABLE "customers"
ADD COLUMN IF NOT EXISTS "portal_project_total" text;
