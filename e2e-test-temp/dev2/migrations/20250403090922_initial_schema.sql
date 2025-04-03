-- SQLSync Migration: initial_schema
-- Generated At: 2025-04-03T09:09:22.302Z
-- Based on detected changes between states.

-- >>> ADDED FILES <<<

-- Added File: /home/tim/Development/sqlsync/e2e-test-temp/dev2/schema/tables/users/table.sql
-- NOTE: File is declarative. Using raw content.
-- sqlsync: startStatement:e6c2f6b55b6dac624867337a89c2684170130f839030caf8495443cbb3c094f8
-- sqlsync: declarativeTable=true
        
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          username TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE
        );
-- sqlsync: endStatement:e6c2f6b55b6dac624867337a89c2684170130f839030caf8495443cbb3c094f8

-- >>> END ADDED FILES <<<

-- >>> DELETED FILES <<<

-- Deleted File: ../test-1743671174408/schema/tables/users/table.sql
-- NOTE: File was declarative. Generating DROP TABLE statement.
-- sqlsync: startStatement:25851915f54f76c5dd278a9137518275bcb83b5b78649b2867c80bd1f7315dd4
DROP TABLE IF EXISTS public.users;
-- sqlsync: endStatement:25851915f54f76c5dd278a9137518275bcb83b5b78649b2867c80bd1f7315dd4

-- Deleted File: schema/tables/users/table.sql
-- NOTE: File was declarative. Generating DROP TABLE statement.
-- sqlsync: startStatement:25851915f54f76c5dd278a9137518275bcb83b5b78649b2867c80bd1f7315dd4
DROP TABLE IF EXISTS public.users;
-- sqlsync: endStatement:25851915f54f76c5dd278a9137518275bcb83b5b78649b2867c80bd1f7315dd4

-- >>> END DELETED FILES <<<
