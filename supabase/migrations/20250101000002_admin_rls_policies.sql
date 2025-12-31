-- Allow admins to view all food_logs
DROP POLICY IF EXISTS "Admins can view all food logs" ON food_logs;
CREATE POLICY "Admins can view all food logs" ON food_logs
  FOR SELECT
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Allow admins to insert food logs for any user
DROP POLICY IF EXISTS "Admins can insert food logs for any user" ON food_logs;
CREATE POLICY "Admins can insert food logs for any user" ON food_logs
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Allow admins to update food logs for any user
DROP POLICY IF EXISTS "Admins can update food logs for any user" ON food_logs;
CREATE POLICY "Admins can update food logs for any user" ON food_logs
  FOR UPDATE
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Allow admins to delete food logs for any user
DROP POLICY IF EXISTS "Admins can delete food logs for any user" ON food_logs;
CREATE POLICY "Admins can delete food logs for any user" ON food_logs
  FOR DELETE
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Allow admins to view all user_profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;
CREATE POLICY "Admins can view all profiles" ON user_profiles
  FOR SELECT
  USING (
    auth.uid() = id 
    OR EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Allow admins to update all user_profiles
DROP POLICY IF EXISTS "Admins can update all profiles" ON user_profiles;
CREATE POLICY "Admins can update all profiles" ON user_profiles
  FOR UPDATE
  USING (
    auth.uid() = id 
    OR EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Allow admins to view all favorited_breakdowns
DROP POLICY IF EXISTS "Admins can view all favorited breakdowns" ON favorited_breakdowns;
CREATE POLICY "Admins can view all favorited breakdowns" ON favorited_breakdowns
  FOR SELECT
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Allow admins to manage all favorited_breakdowns
DROP POLICY IF EXISTS "Admins can manage all favorited breakdowns" ON favorited_breakdowns;
CREATE POLICY "Admins can manage all favorited breakdowns" ON favorited_breakdowns
  FOR ALL
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Allow admins to view all weigh_ins
DROP POLICY IF EXISTS "Admins can view all weigh ins" ON weigh_ins;
CREATE POLICY "Admins can view all weigh ins" ON weigh_ins
  FOR SELECT
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Allow admins to manage all weigh_ins
DROP POLICY IF EXISTS "Admins can manage all weigh ins" ON weigh_ins;
CREATE POLICY "Admins can manage all weigh ins" ON weigh_ins
  FOR ALL
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );
