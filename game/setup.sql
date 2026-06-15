-- Supabase Setup and Security Fixes
-- Copy and run these queries in your Supabase SQL Editor.

-- Enable Row-Level Security on the leaderboard table
ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;

-- 1. Drop the old insecure/permissive policies if they exist
DROP POLICY IF EXISTS "Allow public insert access" ON public.leaderboard;
DROP POLICY IF EXISTS "Allow public update access" ON public.leaderboard;
DROP POLICY IF EXISTS "Allow public insert" ON public.leaderboard;
DROP POLICY IF EXISTS "Allow public read" ON public.leaderboard;

-- 2. Create a secure SELECT policy so everyone can view the scoreboard
CREATE POLICY "Allow public read" 
ON public.leaderboard FOR SELECT 
USING (true);

-- 3. Create a secure INSERT policy for registering new players.
-- This allows registration but prevents clients from setting non-zero stats during signup.
-- We use COALESCE to safely handle NULL values or omitted fields.
CREATE POLICY "Allow public insert" 
ON public.leaderboard FOR INSERT 
WITH CHECK (
  COALESCE(high_score, 0) = 0 AND 
  COALESCE(wins, 0) = 0 AND 
  COALESCE(play_time, 0) = 0
);

-- Note: We are deliberately NOT creating any UPDATE policy on the table.
-- This means direct client-side updates (using `.update()`) are completely disabled,
-- preventing users from spoofing high scores, wins, or play time.

-- 4. Recreate the RPC update function with a secure search_path
-- Drop the function first to avoid any signature/parameter type mismatch errors
DROP FUNCTION IF EXISTS public.update_user_stats(text, text, integer, integer, integer);

CREATE OR REPLACE FUNCTION public.update_user_stats(
  p_username TEXT,
  p_password TEXT,
  p_high_score INTEGER,
  p_wins INTEGER,
  p_play_time INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
-- This fixes the warning by locking the function to the 'public' and temporary schema
SET search_path = public, pg_temp 
AS $$
BEGIN
  -- Verify the password first
  IF EXISTS (
    SELECT 1 FROM public.leaderboard 
    WHERE username = p_username AND password = p_password
  ) THEN
    -- If credentials match, update the record
    UPDATE public.leaderboard
    SET 
      high_score = GREATEST(high_score, p_high_score), -- Only update high score if new score is higher
      wins = p_wins,
      play_time = p_play_time
    WHERE username = p_username;
  ELSE
    RAISE EXCEPTION 'Invalid username or password';
  END IF;
END;
$$;

-- 5. Revoke execution from the default PUBLIC role to secure the function
REVOKE EXECUTE ON FUNCTION public.update_user_stats(text, text, integer, integer, integer) FROM PUBLIC;

-- 6. Grant execution specifically to the roles that need to run it (anon, authenticated, and service_role)
GRANT EXECUTE ON FUNCTION public.update_user_stats(text, text, integer, integer, integer) TO anon, authenticated, service_role;

