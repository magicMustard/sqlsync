-- SQLSync Migration: test_rename_column_final
-- Generated At: 2025-04-12T02:08:58.477Z
-- Based on detected changes between states.


-- >>> MODIFIED FILES <<<

-- Modified File: schema/tables/tenants/table.sql
-- NOTE: File is declarative. Generated ALTER TABLE statements for incremental changes:

-- RENAMED COLUMNS:
-- sqlsync: startStatement:b594dca9ab16d6cbb7d6f4c17b6f32a1676354d331b58abff67296fbcfd81d07
ALTER TABLE public.tenants RENAME COLUMN deleted_at TO updated_at;
-- sqlsync: endStatement:b594dca9ab16d6cbb7d6f4c17b6f32a1676354d331b58abff67296fbcfd81d07

-- >>> END MODIFIED FILES <<<
