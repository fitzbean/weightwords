-- Add fiber tracking to food_logs
ALTER TABLE food_logs ADD COLUMN IF NOT EXISTS fiber DECIMAL(10,1) NOT NULL DEFAULT 0;
