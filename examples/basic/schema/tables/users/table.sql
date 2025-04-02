-- sqlsync: declarativeTable=true

-- Create the users table with a declarative approach
CREATE TABLE users (
	id SERIAL PRIMARY KEY,
	username	VARCHAR(50) NOT NULL UNIQUE,
	email		VARCHAR(100) NOT NULL UNIQUE,
	password_hash	VARCHAR(255) NOT NULL,
	first_name	VARCHAR(50),
	last_name	VARCHAR(50),
	-- Modified column: changed INTEGER to SMALLINT and added NOT NULL constraint
	role_id	SMALLINT NOT NULL,
	-- Modified column: changed from VARCHAR(20) to VARCHAR(15)
	status		VARCHAR(15) DEFAULT 'active',
	-- Added new column for user profile picture
	profile_picture_url VARCHAR(255),
	created_at	TIMESTAMP DEFAULT NOW(),
	updated_at	TIMESTAMP DEFAULT NOW()
);
