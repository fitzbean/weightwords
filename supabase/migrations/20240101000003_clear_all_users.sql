-- WARNING: This will delete ALL users and their associated profiles
-- Run this only if you want to completely reset authentication

-- Delete all user profiles (must be done first due to foreign key constraint)
DELETE FROM public.user_profiles;

-- Delete all food logs
DELETE FROM public.food_logs;

-- Delete all authentication users
DELETE FROM auth.users;

-- Reset the sequence for user IDs (optional)
-- ALTER SEQUENCE auth.users_id_seq RESTART WITH 1;
