-- SQLSync Migration: test_rename_column_final
-- Generated At: 2025-04-12T02:09:19.995Z
-- Based on detected changes between states.


-- >>> MODIFIED FILES <<<

-- Modified File: schema/tables/tenants/table.sql
-- NOTE: File is declarative. Generated ALTER TABLE statements for incremental changes:

-- DROPPED COLUMNS:
-- sqlsync: startStatement:142ba7b1709aec2571ae33a93d8aa6f2938fa804c1a3bb2ae6ac373cd0fd3b2f
ALTER TABLE public.tenants DROP COLUMN updated_at;
-- sqlsync: endStatement:142ba7b1709aec2571ae33a93d8aa6f2938fa804c1a3bb2ae6ac373cd0fd3b2f

-- >>> END MODIFIED FILES <<<
