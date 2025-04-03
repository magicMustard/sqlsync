-- sqlsync: declarativeTable=true
        
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          username TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
        );