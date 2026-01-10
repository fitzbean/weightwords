-- Allow users to view their spouse's food logs and profile
-- This updates the RLS policies to include spouse access

-- =====================
-- FOOD LOGS RLS UPDATE
-- =====================

-- First, drop the existing SELECT policy
DROP POLICY IF EXISTS "Users can view own logs" ON food_logs;

-- Create a new policy that allows viewing own logs OR spouse's logs
CREATE POLICY "Users can view own and spouse logs" ON food_logs 
FOR SELECT 
USING (
  auth.uid() = user_id 
  OR 
  user_id IN (
    SELECT spouse_id FROM user_profiles WHERE id = auth.uid() AND spouse_id IS NOT NULL
  )
);

-- ========================
-- USER PROFILES RLS UPDATE
-- ========================

-- Drop the existing SELECT policy for user_profiles
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;

-- Create a new policy that allows viewing own profile OR spouse's profile
CREATE POLICY "Users can view own and spouse profile" ON user_profiles 
FOR SELECT 
USING (
  auth.uid() = id 
  OR 
  id IN (
    SELECT spouse_id FROM user_profiles WHERE id = auth.uid() AND spouse_id IS NOT NULL
  )
);
