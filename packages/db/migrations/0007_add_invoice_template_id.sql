-- Migration: Add templateId to invoices for template traceability
-- Adds template_id column to invoices table with foreign key to invoice_templates

-- Add new column
ALTER TABLE invoices 
  ADD COLUMN IF NOT EXISTS template_id UUID;

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS invoices_template_id_idx ON invoices(template_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoices_template_id_fkey'
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_template_id_fkey
      FOREIGN KEY (template_id)
      REFERENCES invoice_templates(id)
      ON DELETE SET NULL;
  END IF;
END
$$;
