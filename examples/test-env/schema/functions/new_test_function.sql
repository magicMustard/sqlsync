-- Create a new test function
-- This will test adding a new file

CREATE OR REPLACE FUNCTION functions.new_test_function()
RETURNS TEXT AS $$
BEGIN
    RETURN 'This is a test function for SQLSync';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
