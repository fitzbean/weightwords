-- Create maintenance_days table
CREATE TABLE IF NOT EXISTS maintenance_days (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

-- Enable RLS
ALTER TABLE maintenance_days ENABLE ROW LEVEL SECURITY;

-- Users can view their own maintenance days
CREATE POLICY "Users can view own maintenance days" 
ON maintenance_days FOR SELECT 
USING (auth.uid() = user_id);

-- Users can insert their own maintenance days
CREATE POLICY "Users can insert own maintenance days" 
ON maintenance_days FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own maintenance days
CREATE POLICY "Users can delete own maintenance days" 
ON maintenance_days FOR DELETE 
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_maintenance_days_user_date ON maintenance_days(user_id, date);
