-- Add client request workflow table for customer portal backlog / active sprint tracking.

DO $$
BEGIN
  CREATE TYPE "client_request_status" AS ENUM (
    'backlog',
    'in_progress',
    'in_qa',
    'awaiting_review',
    'completed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "public"."client_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "team_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "title" text NOT NULL,
  "details" text,
  "status" "client_request_status" DEFAULT 'backlog' NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "staging_url" text,
  "requested_by" text,
  "completed_at" timestamp with time zone
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'client_requests_team_id_fkey'
  ) THEN
    ALTER TABLE "public"."client_requests"
      ADD CONSTRAINT "client_requests_team_id_fkey"
      FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id")
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'client_requests_customer_id_fkey'
  ) THEN
    ALTER TABLE "public"."client_requests"
      ADD CONSTRAINT "client_requests_customer_id_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id")
      ON DELETE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "client_requests_team_id_idx"
  ON "public"."client_requests" ("team_id");

CREATE INDEX IF NOT EXISTS "client_requests_customer_id_idx"
  ON "public"."client_requests" ("customer_id");

CREATE INDEX IF NOT EXISTS "client_requests_customer_priority_idx"
  ON "public"."client_requests" ("customer_id", "priority");

-- Enforce "one active task at a time" for each customer.
CREATE UNIQUE INDEX IF NOT EXISTS "client_requests_one_active_per_customer_idx"
  ON "public"."client_requests" ("customer_id")
  WHERE "status" IN ('in_progress', 'in_qa', 'awaiting_review');

ALTER TABLE "public"."client_requests" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_requests'
      AND policyname = 'Client requests can be handled by a member of the team'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'private'
        AND p.proname = 'get_teams_for_authenticated_user'
    ) THEN
      CREATE POLICY "Client requests can be handled by a member of the team"
        ON "public"."client_requests"
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
      CREATE POLICY "Client requests can be handled by a member of the team"
        ON "public"."client_requests"
        AS PERMISSIVE
        FOR ALL
        TO public
        USING (true);
    END IF;
  END IF;
END
$$;
