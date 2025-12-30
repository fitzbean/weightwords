-- Create weigh_ins table
CREATE TABLE IF NOT EXISTS weigh_ins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  weight_lbs DECIMAL(10, 2) NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one entry per user per date
  UNIQUE(user_id, date)
);

-- Create index for faster queries
CREATE INDEX idx_weigh_ins_user_date ON weigh_ins(user_id, date DESC);

-- RLS policies
ALTER TABLE weigh_ins ENABLE ROW LEVEL SECURITY;

-- Users can view their own weigh-ins
CREATE POLICY "Users can view own weigh_ins" ON weigh_ins
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own weigh-ins
CREATE POLICY "Users can insert own weigh_ins" ON weigh_ins
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own weigh-ins
CREATE POLICY "Users can update own weigh_ins" ON weigh_ins
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own weigh-ins
CREATE POLICY "Users can delete own weigh_ins" ON weigh_ins
  FOR DELETE USING (auth.uid() = user_id);
