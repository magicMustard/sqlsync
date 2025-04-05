-- SQLSync Migration: added_subscription_id_to_tenants
-- Generated At: 2025-04-04T00:34:02.697Z
-- Based on detected changes between states.


-- >>> MODIFIED FILES <<<

-- Modified File: schema/tables/tenants/table.sql
-- NOTE: File is declarative. Generated ALTER TABLE statements for incremental changes:

-- ADDED COLUMNS:
-- sqlsync: startStatement:4aee840062f8cad6091f098b64a02f9ccbf946d7319bb3d4f90b2d320c667aab
ALTER TABLE public.tenants ADD COLUMN subscription_id TEXT DEFAULT NULL;
-- sqlsync: endStatement:4aee840062f8cad6091f098b64a02f9ccbf946d7319bb3d4f90b2d320c667aab

-- >>> END MODIFIED FILES <<<
