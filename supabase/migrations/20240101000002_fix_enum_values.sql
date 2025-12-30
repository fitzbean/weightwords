-- Fix the trigger function to use proper enum string values
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, age, gender, weight_lbs, height_ft, height_in, weight_goal, daily_calorie_target, activity_level)
  VALUES (
    new.id,
    30, -- default age
    'male', -- default gender
    150, -- default weight
    5, -- default height ft
    10, -- default height in
    '0', -- default goal (maintain)
    2000, -- default calories
    '1.55' -- default activity level (moderate)
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update existing profiles to use proper enum values
UPDATE user_profiles 
SET 
  weight_goal = CASE 
    WHEN weight_goal = 'maintain' THEN '0'
    WHEN weight_goal = 'lose' THEN '-500'
    WHEN weight_goal = 'gain' THEN '500'
    ELSE weight_goal
  END,
  activity_level = CASE
    WHEN activity_level = 'sedentary' THEN '1.2'
    WHEN activity_level = 'light' THEN '1.375'
    WHEN activity_level = 'moderate' THEN '1.55'
    WHEN activity_level = 'active' THEN '1.725'
    WHEN activity_level = 'very_active' THEN '1.9'
    ELSE activity_level
  END
WHERE weight_goal NOT IN ('-1000', '-500', '0', '500', '1000')
   OR activity_level NOT IN ('1.2', '1.375', '1.55', '1.725', '1.9');
