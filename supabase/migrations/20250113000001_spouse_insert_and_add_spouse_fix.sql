-- Allow users to INSERT food entries for their spouse
-- The existing policy only allows inserting own logs; spouse batch inserts fail entirely

-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "Users can insert own logs" ON food_logs;

-- Create a new INSERT policy that allows inserting own logs OR spouse's logs (bidirectional)
CREATE POLICY "Users can insert own and spouse logs" ON food_logs 
FOR INSERT 
WITH CHECK (
  auth.uid() = user_id 
  OR 
  user_id IN (
    SELECT spouse_id FROM user_profiles WHERE id = auth.uid() AND spouse_id IS NOT NULL
    UNION
    SELECT id FROM user_profiles WHERE spouse_id = auth.uid()
  )
);

-- Fix addSpouse: SECURITY DEFINER function to set both sides atomically
CREATE OR REPLACE FUNCTION set_spouse_relationship(user_id UUID, spouse_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_profiles SET spouse_id = spouse_user_id, updated_at = NOW() WHERE id = user_id;
  UPDATE user_profiles SET spouse_id = user_id, updated_at = NOW() WHERE id = spouse_user_id;
END;
$$;

-- Fix removeSpouse: same RLS issue — clearing the spouse's profile also fails
CREATE OR REPLACE FUNCTION clear_spouse_relationship(user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  spouse UUID;
BEGIN
  -- Get the spouse ID before clearing
  SELECT spouse_id INTO spouse FROM user_profiles WHERE id = user_id;
  
  -- Clear both sides
  UPDATE user_profiles SET spouse_id = NULL, updated_at = NOW() WHERE id = user_id;
  IF spouse IS NOT NULL THEN
    UPDATE user_profiles SET spouse_id = NULL, updated_at = NOW() WHERE id = spouse;
  END IF;
END;
$$;
