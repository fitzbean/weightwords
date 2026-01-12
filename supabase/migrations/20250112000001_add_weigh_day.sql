-- Add weigh_day column to user_profiles
-- This determines which day the week starts for the user's weigh-in tracking
-- 0=Sunday, 1=Monday, ..., 6=Saturday
-- Default to Monday (1) which is common for weekly weigh-ins

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS weigh_day INTEGER DEFAULT 1 CHECK (weigh_day >= 0 AND weigh_day <= 6);

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.weigh_day IS 'Day of week for weigh-in (0=Sunday, 1=Monday, ..., 6=Saturday). Week starts on this day.';
