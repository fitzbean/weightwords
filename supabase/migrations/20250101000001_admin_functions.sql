-- Add is_admin column to user_profiles table
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Create an index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_is_admin ON user_profiles(is_admin);

-- Drop existing function if it exists (to allow changing return type)
DROP FUNCTION IF EXISTS get_all_users_with_profiles();

-- Get all users with their profiles (admin only)
CREATE OR REPLACE FUNCTION get_all_users_with_profiles()
RETURNS TABLE (
  user_id uuid,
  user_email text,
  user_age integer,
  user_gender text,
  user_weight_lbs integer,
  user_height_ft integer,
  user_height_in integer,
  user_activity_level text,
  user_weight_goal text,
  user_daily_calorie_target integer,
  user_profile_completed boolean,
  user_spouse_id uuid,
  user_timezone text,
  user_is_admin boolean,
  user_created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only allow admins to use this function
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() AND up.is_admin = true
  ) THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;
  
  RETURN QUERY
  SELECT 
    u.id AS user_id,
    u.email::text AS user_email,
    p.age AS user_age,
    p.gender::text AS user_gender,
    p.weight_lbs AS user_weight_lbs,
    p.height_ft AS user_height_ft,
    p.height_in AS user_height_in,
    p.activity_level::text AS user_activity_level,
    p.weight_goal::text AS user_weight_goal,
    p.daily_calorie_target AS user_daily_calorie_target,
    p.profile_completed AS user_profile_completed,
    p.spouse_id AS user_spouse_id,
    p.timezone::text AS user_timezone,
    p.is_admin AS user_is_admin,
    p.created_at AS user_created_at
  FROM auth.users u
  LEFT JOIN user_profiles p ON u.id = p.id
  ORDER BY p.created_at DESC NULLS LAST;
END;
$$;
