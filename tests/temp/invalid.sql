-- sqlsync: declarativeTable=true
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL
);

CREATE INDEX idx_username ON users(username);