# SQLSync Complete Example

This example demonstrates all features of SQLSync, with a particular focus on the rollback functionality.

## Directory Structure

```
example-complete/
├── schema/                 # Source SQL schema files
│   ├── tables/             # Table definitions (using declarativeTable mode)
│   │   ├── 01-users.sql
│   │   ├── 02-products.sql
│   │   ├── 03-categories.sql
│   │   ├── 04-orders.sql
│   │   └── 05-order-items.sql
│   └── views/              # View definitions
│       └── 01-product-inventory-view.sql
├── data/                   # Data manipulation files
│   └── seed/               # Seed data (using splitStatements mode)
│       ├── 01-categories-seed.sql
│       ├── 02-products-seed.sql
│       └── 03-users-seed.sql
├── migrations/             # Generated migration files
│   ├── 20250401000000_initial-schema.sql
│   ├── 20250401010000_seed-initial-data.sql
│   ├── 20250401020000_add-customer-info.sql
│   ├── 20250401030000_add-product-reviews.sql
│   ├── 20250401040000_modify-order-tables.sql
│   ├── 20250401050000_add-promotion-tables.sql         # Marked migration (protected)
│   ├── 20250401060000_add-payment-methods.sql
│   ├── 20250402000000_add-inventory-constraints.sql
│   ├── 20250402010000_problematic-changes.sql          # Migration to roll back
│   └── 20250402020000_fix-problems.sql                 # Marked migration (protected)
├── sqlsync-state.json      # SQLSync state tracking
└── sqlsync.yaml            # SQLSync configuration
```

## Key Features Demonstrated

1. **Path-Based SQL Processing**
   - Tables and views are separated into different directories
   - Processing order is controlled in sqlsync.yaml

2. **Declarative Table Mode**
   - All schema/tables/*.sql files use `declarativeTable=true`
   - Changes to table structure generate ALTER TABLE statements

3. **Split Statements Mode**
   - All data/seed/*.sql files use `splitStatements=true`
   - Each INSERT statement is tracked individually

4. **Multi-Developer Workflow**
   - Migrations from multiple authors (dev1, dev2, dev3)
   - Author attribution in generated migrations

5. **Rollback Functionality**
   - Marking/unmarking migrations
   - Rolling back to specific migrations
   - Listing available migrations for rollback

## Example Usage

### Generate Command

Generate migrations after schema changes:

```bash
cd example-complete
sqlsync generate -c sqlsync.yaml
```

### Sync Command

Apply pending migrations:

```bash
cd example-complete
sqlsync sync -c sqlsync.yaml
```

### Rollback Command

#### List Available Migrations For Rollback

```bash
cd example-complete
sqlsync rollback -c sqlsync.yaml --list
```

The output will show all migrations in the order they were applied, with the oldest first:

```
Available migrations:
1. 20250401000000_initial-schema.sql (dev1)
2. 20250401010000_seed-initial-data.sql (dev1)
3. 20250401020000_add-customer-info.sql (dev2)
4. 20250401030000_add-product-reviews.sql (dev1)
5. 20250401040000_modify-order-tables.sql (dev2)
6. 20250401050000_add-promotion-tables.sql (dev3) [MARKED]
7. 20250401060000_add-payment-methods.sql (dev1)
8. 20250402000000_add-inventory-constraints.sql (dev2)
9. 20250402010000_problematic-changes.sql (dev3)
10. 20250402020000_fix-problems.sql (dev1) [MARKED]
```

#### Roll Back to a Specific Migration

To roll back to a specific migration (inclusive), meaning all migrations after it will be rolled back:

```bash
cd example-complete
sqlsync rollback -c sqlsync.yaml 20250402000000_add-inventory-constraints.sql
```

This would roll back migrations 9 and 10 from the list above, but preserve migration 8 (the one specified) and all earlier migrations.

#### Mark a Migration to Protect it from Rollbacks

To mark a migration for protection:

```bash
cd example-complete
sqlsync rollback -c sqlsync.yaml 20250401030000_add-product-reviews.sql --mark
```

This will prevent this migration and all earlier migrations from being rolled back.

#### Unmark a Previously Marked Migration

To unmark a previously marked migration:

```bash
cd example-complete
sqlsync rollback -c sqlsync.yaml 20250401050000_add-promotion-tables.sql --unmark
```

#### Force Rollback (Skip Confirmation)

To skip the confirmation prompt when rolling back:

```bash
cd example-complete
sqlsync rollback -c sqlsync.yaml 20250402000000_add-inventory-constraints.sql --force
```

## Common Rollback Scenarios

### Scenario 1: Rolling Back a Problematic Migration

The migration `20250402010000_problematic-changes.sql` contains several problematic changes:
- Dropping a view that might be used by other components
- Creating a poorly optimized index
- Changing a column type that may cause data truncation

To roll back this problematic migration:

```bash
sqlsync rollback -c sqlsync.yaml 20250402000000_add-inventory-constraints.sql
```

This rolls back to the migration right before the problematic one.

### Scenario 2: Attempting to Roll Back a Marked Migration

The migration `20250401050000_add-promotion-tables.sql` is marked for protection.

If you try to roll back to a migration earlier than this:

```bash
sqlsync rollback -c sqlsync.yaml 20250401040000_modify-order-tables.sql
```

SQLSync will display a warning and prevent the rollback unless you first unmark the migration:

```bash
sqlsync rollback -c sqlsync.yaml 20250401050000_add-promotion-tables.sql --unmark
sqlsync rollback -c sqlsync.yaml 20250401040000_modify-order-tables.sql
```

### Scenario 3: Viewing All Available Rollback Targets

To see all migrations that can be rolled back to:

```bash
sqlsync rollback -c sqlsync.yaml --list
```

## Maximum Rollback Protection

The `sqlsync.yaml` configuration limits how many migrations can be marked for protection:

```yaml
config:
  maxRollbacks: 3
```

This means you can mark at most 3 migrations for protection from rollbacks.
