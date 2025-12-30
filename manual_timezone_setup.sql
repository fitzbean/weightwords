-- Run this manually in the Supabase SQL Editor
-- Add timezone column to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_timezone ON user_profiles(timezone);
