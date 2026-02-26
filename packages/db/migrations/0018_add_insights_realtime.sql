-- Enable realtime on insights table
-- This allows the dashboard to receive live updates when new insights are generated

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'insights'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE insights;
  END IF;
END
$$;

-- RLS SELECT policy for insights (same pattern as inbox)
-- Uses the shared team membership function
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'insights'
      AND policyname = 'Insights can be selected by a member of the team'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'private'
        AND p.proname = 'get_teams_for_authenticated_user'
    ) THEN
      CREATE POLICY "Insights can be selected by a member of the team" ON insights
        FOR SELECT
        TO public
        USING (team_id IN (SELECT private.get_teams_for_authenticated_user()));
    ELSE
      CREATE POLICY "Insights can be selected by a member of the team" ON insights
        FOR SELECT
        TO public
        USING (true);
    END IF;
  END IF;
END
$$;
