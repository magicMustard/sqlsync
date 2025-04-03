-- SQLSync Migration: add_products
-- Generated At: 2025-04-03T09:06:15.017Z
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

-- Added File: /home/tim/Development/sqlsync/e2e-test-temp/dev1/schema/tables/products/table.sql
-- NOTE: File is declarative. Using raw content.
-- sqlsync: startStatement:eaf41d195d5063641d6f7fff63bc24287ba9478752eda96ea593c8f9d14328b8
-- sqlsync: declarativeTable=true
        
        CREATE TABLE products (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          price DECIMAL(10,2) NOT NULL
        );
-- sqlsync: endStatement:eaf41d195d5063641d6f7fff63bc24287ba9478752eda96ea593c8f9d14328b8

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
