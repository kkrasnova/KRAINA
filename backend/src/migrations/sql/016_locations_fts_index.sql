

CREATE INDEX IF NOT EXISTS locations_fts_document_idx ON locations USING gin (
  to_tsvector(
    'simple',
    coalesce(title, '') || ' ' || coalesce(city, '') || ' ' || coalesce(country, '')
  )
);
