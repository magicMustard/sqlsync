-- sqlsync: declarativeTable=true
        
        CREATE TABLE orders (
          id SERIAL PRIMARY KEY,
          user_id INTEGER,
          order_date TIMESTAMP NOT NULL
        );