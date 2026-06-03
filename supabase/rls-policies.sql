-- ============================================================
--  Skyward Masters Bug Tracker — Supabase RLS Policies
--  Run all of this once in the Supabase SQL editor.
--  Order matters: create the helper function first.
-- ============================================================


-- ── Helper function ───────────────────────────────────────────────────────────
-- Reads the current authenticated user's role from the profiles table.
-- Used by policies below to gate access by role.

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;


-- ── bugreports ────────────────────────────────────────────────────────────────

ALTER TABLE bugreports ENABLE ROW LEVEL SECURITY;

-- Anyone (including the public submit form) can insert a report
CREATE POLICY "Anyone can submit a bug report"
ON bugreports FOR INSERT
WITH CHECK (true);

-- Only authenticated staff can read reports
CREATE POLICY "Staff can view reports"
ON bugreports FOR SELECT
TO authenticated
USING (true);

-- Admins and developers can update reports (status, assignee, etc.)
CREATE POLICY "Admins and developers can update reports"
ON bugreports FOR UPDATE
TO authenticated
USING (get_my_role() IN ('admin', 'developer'))
WITH CHECK (get_my_role() IN ('admin', 'developer'));

-- Only admins can delete reports
CREATE POLICY "Admins can delete reports"
ON bugreports FOR DELETE
TO authenticated
USING (get_my_role() = 'admin');


-- ── comments ──────────────────────────────────────────────────────────────────

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Only authenticated staff can read comments
CREATE POLICY "Staff can view comments"
ON comments FOR SELECT
TO authenticated
USING (true);

-- Authenticated staff can post comments (only as themselves)
CREATE POLICY "Staff can post comments"
ON comments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);


-- ── profiles ──────────────────────────────────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all profiles (needed for assignee dropdowns)
CREATE POLICY "Staff can view profiles"
ON profiles FOR SELECT
TO authenticated
USING (true);

-- Only admins can create new profiles
CREATE POLICY "Admins can create profiles"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (get_my_role() = 'admin');

-- Admins can update any profile (role changes, etc.)
CREATE POLICY "Admins can update profiles"
ON profiles FOR UPDATE
TO authenticated
USING (get_my_role() = 'admin')
WITH CHECK (get_my_role() = 'admin');

-- Users can update their own profile (covers the first-login password reset flag)
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Only admins can delete profiles
CREATE POLICY "Admins can delete profiles"
ON profiles FOR DELETE
TO authenticated
USING (get_my_role() = 'admin');
