-- Add UPDATE policy for favorited_breakdowns
CREATE POLICY "Users can update their own favorited breakdowns"
  ON favorited_breakdowns FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
