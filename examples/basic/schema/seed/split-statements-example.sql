-- seed/split-statements-example.sql
-- sqlsync: splitStatements=true

-- Seed data for categories - each statement is tracked individually
INSERT INTO categories (name, description) VALUES ('Electronics', 'Electronic devices and accessories');
INSERT INTO categories (name, description) VALUES ('Books', 'Books, e-books and publications');
INSERT INTO categories (name, description) VALUES ('Clothing', 'Apparel and fashion accessories');

-- Seed data for users
INSERT INTO users (username, email, password_hash, first_name, last_name)
VALUES ('admin', 'admin@example.com', 'hashed_password_1', 'Admin', 'User');

INSERT INTO users (username, email, password_hash, first_name, last_name)
VALUES ('test', 'test@example.com', 'hashed_password_2', 'Test', 'User');
