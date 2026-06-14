CREATE TABLE locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  city text NOT NULL,
  country text NOT NULL DEFAULT 'Ukraine',
  lat decimal(9, 6) NOT NULL,
  lng decimal(9, 6) NOT NULL,
  category text NOT NULL CHECK (
    category IN ('monument', 'museum', 'park', 'church', 'art', 'other')
  ),
  cover_image_url text,
  is_online_available boolean NOT NULL DEFAULT true,
  is_published boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS location_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations (id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'uk',
  title text NOT NULL,
  text_content text NOT NULL,
  audio_url text,
  ar_content_url text,
  duration_sec integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, language)
);
