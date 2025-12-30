-- Add timezone column to user_profiles
ALTER TABLE user_profiles ADD COLUMN timezone TEXT DEFAULT 'UTC';

-- Create index for performance
CREATE INDEX idx_user_profiles_timezone ON user_profiles(timezone);
