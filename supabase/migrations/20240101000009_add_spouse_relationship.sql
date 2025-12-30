-- Add spouse relationship to user_profiles
ALTER TABLE user_profiles ADD COLUMN spouse_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX idx_user_profiles_spouse_id ON user_profiles(spouse_id);

-- Function to get spouse's favorites
CREATE OR REPLACE FUNCTION get_shared_favorites(current_user_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  breakdown JSONB,
  total_calories INTEGER,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  user_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT fb.*
  FROM favorited_breakdowns fb
  WHERE fb.user_id = current_user_id
     OR fb.user_id = (
       SELECT spouse_id FROM user_profiles WHERE id = current_user_id
     )
     OR fb.user_id = (
       SELECT id FROM user_profiles WHERE spouse_id = current_user_id
     )
  ORDER BY fb.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
