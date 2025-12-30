-- Fix ambiguous column references
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
  SELECT 
    fb.id,
    fb.name,
    fb.breakdown,
    fb.total_calories,
    fb.created_at,
    fb.updated_at,
    fb.user_id
  FROM favorited_breakdowns fb
  WHERE fb.user_id = current_user_id
  ORDER BY fb.created_at DESC;
  
  -- If we have a spouse, add their favorites too
  IF EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = current_user_id AND up.spouse_id IS NOT NULL) THEN
    RETURN QUERY
    SELECT 
      fb.id,
      fb.name,
      fb.breakdown,
      fb.total_calories,
      fb.created_at,
      fb.updated_at,
      fb.user_id
    FROM favorited_breakdowns fb
    WHERE fb.user_id = (SELECT up.spouse_id FROM user_profiles up WHERE up.id = current_user_id)
    ORDER BY fb.created_at DESC;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_shared_favorites(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_shared_favorites(UUID) TO service_role;
