-- tables/users/types.sql

-- Define custom types for the users table
CREATE TYPE user_role AS ENUM ('admin', 'user', 'guest');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended');
