-- Add profile_completed flag to user_profiles table
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE;

-- Update existing profiles that have been filled out to mark them as completed
UPDATE public.user_profiles 
SET profile_completed = TRUE 
WHERE daily_calorie_target != 2000 OR age != 30;

-- Update the trigger function to set profile_completed to FALSE for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, age, gender, weight_lbs, height_ft, height_in, weight_goal, daily_calorie_target, activity_level, profile_completed)
  VALUES (
    NEW.id,
    30,
    'male',
    150,
    5,
    10,
    '0',
    2000,
    '1.55',
    FALSE
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
