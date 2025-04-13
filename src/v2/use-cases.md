## Overview
Overall, the sqlsync application is desigend to not migrate sql to a database, it's designed to help build the migration files using a declarative approach and basic SQL files.

The intention here is that you define your table in sql files, functions, triggers, the table, etc. Based on the type of sql statement, sqlsync will simply copy do one of 3 things:

1. Copy the contents of the file to the migration file (explained further below)

2. It can read individual statements in an sql file (using the splitStatement flag) and this is designed to track each statement individually

3. There is a declarativeTable flag designed to track the state of the table. Instead of using ALTER TABLE statements throughout multiple migrations, you're simply making the change in the original CREATE TABLE statement. Sqlsync will detect the column change and integrate that into the migration file as an ALTER STATEMENT.

Sqlsync will create the migration file with your changes and then also create a state.json file which tracks the state of your declarative files. Using this state.json file, if a change in a file is detected, it'll be added to the migration file.

## Warning
Sqlsync is opinionated. Your CREATE TABLE statements should not have indexes in them. I would recommend having them in a seperate sql file.

## Application use cases

1. If there is no sqlsync-state.json file in the same directory as the sqlsync.yaml file, it is assumed that it is a brand new starting from scratch meaning everything is added.

2. The sqlsync.yaml file dictates how the application works, your application structure and files to include. Not including them in the sqlsync.yaml file results in the file being ignored.

3. Only .sql files are paid attention to.

4. For checksums to be generated, we strip all spaces / tabs, new lines and comments in the file to detect a change. That way spaces, tabs, new lines and comments don't impact the checksum.

4.1 This is different for a declarative table where the table is broken down into it's columns, then the stripping is applied.

4.2 You will still see the spaces and tabs in the migration file, to ensure you can read your sql statements. Comments will be removed.

5. Deleting files assumes that you're removing statements. Sqlsync does not write DROP statements. You're responsible for doing that in the migration file once created. The reason for this is that sqlsync, though cool, is still dumb. It doesn't know what changes you need to make to support the drop.

6. This sqlsync tool is designed for PSQL use at this point in time.

7. The state.json file is designed to keep track of all the checksums, current migrations, etc. It has a simple design keeping track of the migration files. Using them and their timestamp to know the "latest" migration.

7.1 New generate migrations are compared to the latest migration file.

7.2 The state.json keeps track of the content types as listed below with their checksum and other details that can be easily compared.

## File content use cases

1. If no sqlsync flag is at the top of the file, the contents of the file are copied to the migration file (excluding comments)

## Split statement use cases

1. If the splitStatement flag is set (for example -- syncsync: splitStatements), then each statement in the file is split out as it's own statement and is tracked individually.

2. splitStatement flag requires that you use "-- sqlsync: startStatement" and "-- sqlsync: endStatement" to tell sqlsync when to start tracking and stopping a specific statement.

3. Sqlsync doesn't capture or read the sql statement. It'll simply grab the content inside that flags (in point 2) and checksum it. Applying the commenting and space stripping rules mentioned in point 4 of app use cases.

## Declarative Table Use Cases

The declarative table use cases are the most complicated ones.

1. If the declarativeTable flag is set, the file is processed as a declarative table.

2. A declarativeTable file can strictly only have the CREATE TABLE statement in that file. Sqlsync isn't interested in tracking individual statements in this file. It only wants to track the CREATE TABLE.

3. If this is a new fresh start of sqlsync meaning either of the following:

a) Sqlsync has never been run for the project

b) This is a new table that sqlsync hasn't seen or tracked before

Then, sqlsync simply adds the create table in it's entirety to the migration file.

4. Once the create table statement is being tracked in the state.json file, then it turns into a modification table if you will. This means that sqlsync breaks down the CREATE TABLE statement into the table and columns.

For example, if you had:

CREATE TABLE public.tenant(
	id PRIMARY KEY DEFAULT uuidv4(),
	name TEXT DEFAULT NULL
);

If this was the first time running sqlsync, it will copy this into the migration file directly.

Now, if you make a modification to the CREATE TABLE statement from that point forward, it assumes that you're modifying something.

Let's say, the sql file with the statement above changes to:

CREATE TABLE public.tenant(
	id PRIMARY KEY DEFAULT uuidv4(),
	name TEXT NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

Sqlsync should detect 2 changes:

1. The name has changed to not null

2. The created at has been added

As a result, the migration file will have the following changes:

ALTER TABLE public.tenant
ALTER COLUMN name SET NOT NULL;

ALTER TABLE public.tenant
ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

To that end, sqlsync in the state.json file breaksdown the declarative table into the columns and structure of the columns to be able to manage the state of the column individually.

5. If you rename a column, sqlsync cannot detect this with the sql file. It will ask you via CLI did you remove it or rename it?

5.1 Removing it results in a DROP COLUMN statement.

5.2 Renaming it will result in a second command question asking what was it renamed to. If this matches another column in the sql file table statement, then it will write a RENAME COLUMN statement. If it cannot find it in the sql file, perhaps you made a typo or something, it will throw an error saying that it couldn't find the new column.

6. Because PSQL is picky with how alter table statements are written based on what's changed, this is why we break down the structure of the column.