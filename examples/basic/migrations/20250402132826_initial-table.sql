-- SQLSync Migration: initial-table
-- Generated At: 2025-04-02T03:28:26.062Z
-- Based on detected changes between states.

-- >>> ADDED FILES <<<

-- Added File: /home/tim/Development/sqlsync/example/schema/schemas.sql
CREATE SCHEMA IF NOT EXISTS public;

-- Added File: /home/tim/Development/sqlsync/example/schema/functions/update_updated_at_column.sql
-- functions/update_updated_at_column.sql

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = NOW();
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Added File: /home/tim/Development/sqlsync/example/schema/tables/users/types.sql
-- tables/users/types.sql

-- Define custom types for the users table
CREATE TYPE user_role AS ENUM ('admin', 'user', 'guest');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended');

-- Added File: /home/tim/Development/sqlsync/example/schema/tables/users/table.sql
-- NOTE: File is declarative. Using raw content.
-- sqlsync: declarativeTable=true

-- Create the users table with a declarative approach
CREATE TABLE users (
	id SERIAL PRIMARY KEY,
	username	VARCHAR(50) NOT NULL UNIQUE,
	email		VARCHAR(100) NOT NULL UNIQUE,
	password_hash	VARCHAR(255) NOT NULL,
	first_name	VARCHAR(50),
	last_name	VARCHAR(50),
	role_id	INTEGER,
	status		VARCHAR(20) DEFAULT 'active',
	login_attempts	INTEGER DEFAULT 0,
	created_at	TIMESTAMP DEFAULT NOW(),
	updated_at	TIMESTAMP DEFAULT NOW()
);

-- Added File: /home/tim/Development/sqlsync/example/schema/tables/products/table.sql
-- NOTE: File is declarative. Using raw content.
-- sqlsync: declarativeTable=true

-- Create the products table
CREATE TABLE products (
	id SERIAL PRIMARY KEY,
	name VARCHAR(100) NOT NULL,
	description TEXT,
	price DECIMAL(10, 2) NOT NULL,
	stock_quantity INTEGER NOT NULL DEFAULT 0,
	category_id INTEGER,
	is_featured BOOLEAN DEFAULT FALSE,
	discount_percentage DECIMAL(5, 2) DEFAULT 0,
	created_at TIMESTAMP DEFAULT NOW(),
	updated_at TIMESTAMP DEFAULT NOW()
);

-- >>> END ADDED FILES <<<