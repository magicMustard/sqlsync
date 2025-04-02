-- sqlsync: declarativeTable=true
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL, -- Changed length
    description TEXT, -- Added column
    -- price removed
    created_at TIMESTAMP DEFAULT NOW() -- Added column
);