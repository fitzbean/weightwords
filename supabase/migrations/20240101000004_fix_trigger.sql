-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Recreate the function with proper permissions
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, age, gender, weight_lbs, height_ft, height_in, weight_goal, daily_calorie_target, activity_level)
  VALUES (
    NEW.id,
    30,
    'male',
    150,
    5,
    10,
    '0',
    2000,
    '1.55'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, service_role;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Also create profile for any existing users that don't have one
INSERT INTO public.user_profiles (id, age, gender, weight_lbs, height_ft, height_in, weight_goal, daily_calorie_target, activity_level)
SELECT id, 30, 'male', 150, 5, 10, '0', 2000, '1.55'
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.user_profiles);
