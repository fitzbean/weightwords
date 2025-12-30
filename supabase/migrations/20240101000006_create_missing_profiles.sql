-- Create profiles for any users that don't have one
INSERT INTO public.user_profiles (id, age, gender, weight_lbs, height_ft, height_in, weight_goal, daily_calorie_target, activity_level, profile_completed)
SELECT id, 30, 'male', 150, 5, 10, '0', 2000, '1.55', FALSE
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.user_profiles);
