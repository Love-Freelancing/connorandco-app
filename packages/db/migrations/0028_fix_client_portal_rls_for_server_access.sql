-- Ensure server-side API connections can read/write client portal tables even
-- when there is no Supabase JWT context (e.g. direct postgres connections).

DO $$
DECLARE
  has_auth_helper boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private'
      AND p.proname = 'get_teams_for_authenticated_user'
  ) INTO has_auth_helper;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_requests'
      AND policyname = 'Client requests can be handled by a member of the team'
  ) THEN
    DROP POLICY "Client requests can be handled by a member of the team"
      ON "public"."client_requests";
  END IF;

  IF has_auth_helper THEN
    CREATE POLICY "Client requests can be handled by a member of the team"
      ON "public"."client_requests"
      AS PERMISSIVE
      FOR ALL
      TO public
      USING (
        team_id IN (
          SELECT private.get_teams_for_authenticated_user() AS get_teams_for_authenticated_user
        )
        OR current_user = 'postgres'
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
      )
      WITH CHECK (
        team_id IN (
          SELECT private.get_teams_for_authenticated_user() AS get_teams_for_authenticated_user
        )
        OR current_user = 'postgres'
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
      );
  ELSE
    -- Local/dev fallback if helper function is unavailable.
    CREATE POLICY "Client requests can be handled by a member of the team"
      ON "public"."client_requests"
      AS PERMISSIVE
      FOR ALL
      TO public
      USING (true)
      WITH CHECK (true);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_portal_messages'
      AND policyname = 'Client portal messages can be handled by a member of the team'
  ) THEN
    DROP POLICY "Client portal messages can be handled by a member of the team"
      ON "public"."client_portal_messages";
  END IF;

  IF has_auth_helper THEN
    CREATE POLICY "Client portal messages can be handled by a member of the team"
      ON "public"."client_portal_messages"
      AS PERMISSIVE
      FOR ALL
      TO public
      USING (
        team_id IN (
          SELECT private.get_teams_for_authenticated_user() AS get_teams_for_authenticated_user
        )
        OR current_user = 'postgres'
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
      )
      WITH CHECK (
        team_id IN (
          SELECT private.get_teams_for_authenticated_user() AS get_teams_for_authenticated_user
        )
        OR current_user = 'postgres'
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
      );
  ELSE
    -- Local/dev fallback if helper function is unavailable.
    CREATE POLICY "Client portal messages can be handled by a member of the team"
      ON "public"."client_portal_messages"
      AS PERMISSIVE
      FOR ALL
      TO public
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;
