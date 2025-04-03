-- SQLSync Migration: add_created_at
-- Generated At: 2025-04-03T09:06:14.710Z
-- Based on detected changes between states.

-- >>> ADDED FILES <<<

-- Added File: /home/tim/Development/sqlsync/e2e-test-temp/dev1/schema/tables/users/table.sql
-- NOTE: File is declarative. Using raw content.
-- sqlsync: startStatement:edb67dc9f574634d9fe82d2ab3740e53511a1a0d743ada39fe3cdf0b628a5abd
-- sqlsync: declarativeTable=true
        
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          username TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
        );
-- sqlsync: endStatement:edb67dc9f574634d9fe82d2ab3740e53511a1a0d743ada39fe3cdf0b628a5abd

-- >>> END ADDED FILES <<<

-- >>> DELETED FILES <<<

-- Deleted File: ../test-1743671174408/schema/tables/users/table.sql
-- NOTE: File was declarative. Generating DROP TABLE statement.
-- sqlsync: startStatement:25851915f54f76c5dd278a9137518275bcb83b5b78649b2867c80bd1f7315dd4
DROP TABLE IF EXISTS public.users;
-- sqlsync: endStatement:25851915f54f76c5dd278a9137518275bcb83b5b78649b2867c80bd1f7315dd4

-- >>> END DELETED FILES <<<
