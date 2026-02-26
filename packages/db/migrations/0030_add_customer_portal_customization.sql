ALTER TABLE "customers"
ADD COLUMN IF NOT EXISTS "portal_hide_subscription_cta" boolean DEFAULT false;
