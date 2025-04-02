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
