-- SQLSync Migration: column-changes
-- Generated At: 2025-04-02T03:28:49.286Z
-- Based on detected changes between states.


-- >>> MODIFIED FILES <<<

-- Modified File: /home/tim/Development/sqlsync/example/schema/tables/users/table.sql
-- NOTE: File is declarative. Generated ALTER TABLE statements for incremental changes:

-- ADDED COLUMNS:
ALTER TABLE users ADD COLUMN profile_picture_url VARCHAR(255);

-- MODIFIED COLUMNS:
ALTER TABLE users ALTER COLUMN role_id TYPE SMALLINT USING role_id::SMALLINT;
ALTER TABLE users ALTER COLUMN role_id SET NOT NULL;
ALTER TABLE users ALTER COLUMN status TYPE VARCHAR(15) USING status::VARCHAR(15);

-- DROPPED COLUMNS:
ALTER TABLE users DROP COLUMN login_attempts;

-- >>> END MODIFIED FILES <<<