-- Fix infinite recursion in user_profiles policy
-- The issue is that checking is_admin requires querying user_profiles, which triggers the policy again

-- Drop the problematic policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON user_profiles;

-- Create a security definer function to check admin status without triggering RLS
CREATE OR REPLACE FUNCTION is_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM user_profiles WHERE id = user_id),
    false
  );
$$;

-- Now recreate policies using the function
-- For user_profiles - users can see their own, admins can see all
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT
  USING (auth.uid() = id OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE
  USING (auth.uid() = id OR is_admin(auth.uid()));

-- Update food_logs policies to use the function
DROP POLICY IF EXISTS "Admins can view all food logs" ON food_logs;
DROP POLICY IF EXISTS "Users can view own food logs" ON food_logs;
CREATE POLICY "Users can view own food logs" ON food_logs
  FOR SELECT
  USING (auth.uid() = user_id OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert food logs for any user" ON food_logs;
DROP POLICY IF EXISTS "Users can insert own food logs" ON food_logs;
CREATE POLICY "Users can insert own food logs" ON food_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update food logs for any user" ON food_logs;
DROP POLICY IF EXISTS "Users can update own food logs" ON food_logs;
CREATE POLICY "Users can update own food logs" ON food_logs
  FOR UPDATE
  USING (auth.uid() = user_id OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete food logs for any user" ON food_logs;
DROP POLICY IF EXISTS "Users can delete own food logs" ON food_logs;
CREATE POLICY "Users can delete own food logs" ON food_logs
  FOR DELETE
  USING (auth.uid() = user_id OR is_admin(auth.uid()));

-- Update favorited_breakdowns policies
DROP POLICY IF EXISTS "Admins can view all favorited breakdowns" ON favorited_breakdowns;
DROP POLICY IF EXISTS "Admins can manage all favorited breakdowns" ON favorited_breakdowns;
DROP POLICY IF EXISTS "Users can view own favorited breakdowns" ON favorited_breakdowns;
CREATE POLICY "Users can view own favorited breakdowns" ON favorited_breakdowns
  FOR SELECT
  USING (auth.uid() = user_id OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can manage own favorited breakdowns" ON favorited_breakdowns;
CREATE POLICY "Users can manage own favorited breakdowns" ON favorited_breakdowns
  FOR ALL
  USING (auth.uid() = user_id OR is_admin(auth.uid()));

-- Update weigh_ins policies
DROP POLICY IF EXISTS "Admins can view all weigh ins" ON weigh_ins;
DROP POLICY IF EXISTS "Admins can manage all weigh ins" ON weigh_ins;
DROP POLICY IF EXISTS "Users can view own weigh ins" ON weigh_ins;
CREATE POLICY "Users can view own weigh ins" ON weigh_ins
  FOR SELECT
  USING (auth.uid() = user_id OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can manage own weigh ins" ON weigh_ins;
CREATE POLICY "Users can manage own weigh ins" ON weigh_ins
  FOR ALL
  USING (auth.uid() = user_id OR is_admin(auth.uid()));
