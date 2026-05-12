-- Add role column to profiles table
ALTER TABLE profiles
  ADD COLUMN role text NOT NULL DEFAULT 'student'
  CHECK (role IN ('student', 'admin'));

-- NOTE: profiles_admin_select intentionally omitted — querying profiles inside
-- a profiles SELECT policy causes RLS recursion. Admin CMS uses service-role
-- client (bypasses RLS) so this policy is not needed for Sprint 2A.

-- Admins can insert listings
CREATE POLICY "listings_admin_insert"
  ON listings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can update listings
CREATE POLICY "listings_admin_update"
  ON listings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can delete listings
CREATE POLICY "listings_admin_delete"
  ON listings FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );
