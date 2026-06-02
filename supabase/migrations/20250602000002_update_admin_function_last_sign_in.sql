-- Update get_all_users_with_profiles to return last food log date instead of last_sign_in_at
DROP FUNCTION IF EXISTS get_all_users_with_profiles();

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
  user_last_food_date timestamptz
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
    fl.last_food_date AS user_last_food_date
  FROM auth.users u
  LEFT JOIN user_profiles p ON u.id = p.id
  LEFT JOIN (
    SELECT user_id, MAX(date) AS last_food_date
    FROM food_logs
    GROUP BY user_id
  ) fl ON u.id = fl.user_id
  ORDER BY fl.last_food_date DESC NULLS LAST;
END;
$$;
