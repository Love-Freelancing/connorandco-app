-- Add bi-directional portal messages between customer and freelancer.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'client_portal_message_sender'
  ) THEN
    CREATE TYPE "client_portal_message_sender" AS ENUM ('client', 'freelancer');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "public"."client_portal_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "team_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "request_id" uuid,
  "sender_type" "client_portal_message_sender" NOT NULL,
  "sender_user_id" uuid,
  "sender_name" text,
  "message" text NOT NULL,
  "attachments" jsonb NOT NULL DEFAULT '[]'::jsonb
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_portal_messages_team_id_fkey'
  ) THEN
    ALTER TABLE "public"."client_portal_messages"
      ADD CONSTRAINT "client_portal_messages_team_id_fkey"
      FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id")
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_portal_messages_customer_id_fkey'
  ) THEN
    ALTER TABLE "public"."client_portal_messages"
      ADD CONSTRAINT "client_portal_messages_customer_id_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id")
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_portal_messages_request_id_fkey'
  ) THEN
    ALTER TABLE "public"."client_portal_messages"
      ADD CONSTRAINT "client_portal_messages_request_id_fkey"
      FOREIGN KEY ("request_id") REFERENCES "public"."client_requests"("id")
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_portal_messages_sender_user_id_fkey'
  ) THEN
    ALTER TABLE "public"."client_portal_messages"
      ADD CONSTRAINT "client_portal_messages_sender_user_id_fkey"
      FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "client_portal_messages_team_id_idx"
  ON "public"."client_portal_messages" ("team_id");

CREATE INDEX IF NOT EXISTS "client_portal_messages_customer_id_idx"
  ON "public"."client_portal_messages" ("customer_id");

CREATE INDEX IF NOT EXISTS "client_portal_messages_request_id_idx"
  ON "public"."client_portal_messages" ("request_id");

ALTER TABLE "public"."client_portal_messages" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_portal_messages'
      AND policyname = 'Client portal messages can be handled by a member of the team'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'private'
        AND p.proname = 'get_teams_for_authenticated_user'
    ) THEN
      CREATE POLICY "Client portal messages can be handled by a member of the team"
        ON "public"."client_portal_messages"
        AS PERMISSIVE
        FOR ALL
        TO public
        USING (
          team_id IN (
            SELECT private.get_teams_for_authenticated_user() AS get_teams_for_authenticated_user
          )
        );
    ELSE
      -- Local/dev fallback when auth helper schema is unavailable.
      CREATE POLICY "Client portal messages can be handled by a member of the team"
        ON "public"."client_portal_messages"
        AS PERMISSIVE
        FOR ALL
        TO public
        USING (true);
    END IF;
  END IF;
END $$;
