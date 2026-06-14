
DO $$
DECLARE
  uid uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM locations WHERE is_published = true LIMIT 1) THEN
    RETURN;
  END IF;

  SELECT id INTO uid FROM users WHERE email = 'seed.catalog@kraina.internal' LIMIT 1;
  IF uid IS NULL THEN
    INSERT INTO users (id, email, password_hash, auth_provider, role, status)
    VALUES (gen_random_uuid(), 'seed.catalog@kraina.internal', NULL, 'email', 'admin', 'active')
    RETURNING id INTO uid;
  END IF;

  IF uid IS NULL THEN
    SELECT id INTO uid FROM users ORDER BY created_at ASC LIMIT 1;
  END IF;
  IF uid IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO locations (title, city, country, lat, lng, category, is_online_available, is_published, created_by)
  VALUES
    ('Майдан Незалежності', 'Київ', 'Ukraine', 50.4501, 30.5233, 'monument', true, true, uid),
    ('Софійський собор', 'Київ', 'Ukraine', 50.4528, 30.5144, 'church', true, true, uid),
    ('Музей залізничної техніки', 'Київ', 'Ukraine', 50.3951, 30.4962, 'museum', true, true, uid),
    ('Rijksmuseum', 'Амстердам', 'Netherlands', 52.3600, 4.8852, 'museum', true, true, uid);
END $$;
