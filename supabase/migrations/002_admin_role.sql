-- Add role column to profiles table
ALTER TABLE profiles
  ADD COLUMN role text NOT NULL DEFAULT 'student'
  CHECK (role IN ('student', 'admin'));

-- Admins can read all profiles
CREATE POLICY "profiles_admin_select"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

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
