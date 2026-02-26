ALTER TABLE "client_requests"
ADD COLUMN IF NOT EXISTS "resources" jsonb DEFAULT '[]'::jsonb NOT NULL;

UPDATE "client_requests"
SET "resources" = jsonb_build_array(
  jsonb_build_object(
    'label', 'Live Staging',
    'url', "staging_url"
  )
)
WHERE (
  "staging_url" IS NOT NULL
  AND btrim("staging_url") <> ''
  AND (
    "resources" = '[]'::jsonb
    OR "resources" IS NULL
  )
);
