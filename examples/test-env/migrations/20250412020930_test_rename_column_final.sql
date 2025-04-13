-- SQLSync Migration: test_rename_column_final
-- Generated At: 2025-04-12T02:09:30.865Z
-- Based on detected changes between states.


-- >>> MODIFIED FILES <<<

-- Modified File: schema/tables/tenants/table.sql
-- NOTE: File is declarative. Generated ALTER TABLE statements for incremental changes:

-- ADDED COLUMNS:
-- sqlsync: startStatement:1c9c31a5f72f010134b647148d5331eaf86ede8303c75504a3471e1c48c30ff7
ALTER TABLE public.tenants ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- sqlsync: endStatement:1c9c31a5f72f010134b647148d5331eaf86ede8303c75504a3471e1c48c30ff7

-- >>> END MODIFIED FILES <<<
