
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS saved_route_plans jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN profiles.saved_route_plans IS 'JSON array of { id, savedAt, titleHint, routePlan } from app profileStorage';
