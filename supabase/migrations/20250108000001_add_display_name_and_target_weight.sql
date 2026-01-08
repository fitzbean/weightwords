-- Add display_name and target_weight_lbs columns to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS target_weight_lbs INTEGER;
