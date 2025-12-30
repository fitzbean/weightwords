-- Create favorited_breakdowns table
CREATE TABLE IF NOT EXISTS favorited_breakdowns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  breakdown JSONB NOT NULL,
  total_calories INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE favorited_breakdowns ENABLE ROW LEVEL SECURITY;

-- Create policy for users to view their own favorited breakdowns
CREATE POLICY "Users can view their own favorited breakdowns"
  ON favorited_breakdowns FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy for users to insert their own favorited breakdowns
CREATE POLICY "Users can insert their own favorited breakdowns"
  ON favorited_breakdowns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create policy for users to delete their own favorited breakdowns
CREATE POLICY "Users can delete their own favorited breakdowns"
  ON favorited_breakdowns FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for performance
CREATE INDEX idx_favorited_breakdowns_user_id ON favorited_breakdowns(user_id);
CREATE INDEX idx_favorited_breakdowns_created_at ON favorited_breakdowns(created_at);

-- Trigger to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_favorited_breakdowns_updated_at
  BEFORE UPDATE ON favorited_breakdowns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
