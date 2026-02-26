-- Ensure the Supabase storage bucket used by document and portal uploads exists.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
SELECT 'vault', 'vault', false, 26214400
WHERE NOT EXISTS (
  SELECT 1
  FROM storage.buckets
  WHERE id = 'vault'
);
