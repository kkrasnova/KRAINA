
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS firebase_uid text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_firebase_uid
  ON profiles (firebase_uid)
  WHERE firebase_uid IS NOT NULL AND btrim(firebase_uid) <> '';
