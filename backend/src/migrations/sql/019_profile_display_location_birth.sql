ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birth_date_public boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location_label text;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_display_name_len;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_display_name_len CHECK (display_name IS NULL OR char_length(display_name) <= 80);

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_location_label_len;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_location_label_len CHECK (location_label IS NULL OR char_length(location_label) <= 200);
