-- Migration: Fix stuck pending documents
-- This migration fixes documents that are stuck in "pending" status due to previous pipeline issues

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'documents'
      AND column_name = 'updated_at'
  ) THEN
    -- 1. Fix documents that have been processed (have title or content) but status was never updated
    UPDATE documents
    SET
      processing_status = 'completed',
      updated_at = NOW()
    WHERE
      processing_status = 'pending'
      AND (title IS NOT NULL OR content IS NOT NULL);

    -- 2. Mark truly stale documents as failed
    UPDATE documents
    SET
      processing_status = 'failed',
      updated_at = NOW()
    WHERE
      processing_status = 'pending'
      AND created_at < NOW() - INTERVAL '1 hour'
      AND title IS NULL
      AND content IS NULL;
  ELSE
    -- Fallback for schemas where documents.updated_at does not exist.
    UPDATE documents
    SET processing_status = 'completed'
    WHERE
      processing_status = 'pending'
      AND (title IS NOT NULL OR content IS NOT NULL);

    UPDATE documents
    SET processing_status = 'failed'
    WHERE
      processing_status = 'pending'
      AND created_at < NOW() - INTERVAL '1 hour'
      AND title IS NULL
      AND content IS NULL;
  END IF;
END
$$;
