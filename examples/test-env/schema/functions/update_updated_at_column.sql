-- Create a trigger function to update the `updated_at` timestamp
-- Function: update_updated_at_column()
-- This function automatically updates the 'updated_at' column to the current timestamp
-- Whenever a row is updated in a table with this trigger
-- ensure this function is included in the migration
-- updated: 2025-04-12 11:43 AM
CREATE OR REPLACE FUNCTION functions.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now(); 
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Test comment update: 2025-04-12T11:55:00+10:00
