import { Op, QueryTypes } from 'sequelize';
import { Location } from '../models/sequelize/index.js';
import { sequelize } from '../db/sequelize.js';

const FTS_DOC_SQL = `to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(city, '') || ' ' || coalesce(country, ''))`;

export async function listPublishedLocations(opts: { limit: number; city?: string }) {
  const where: Record<string, unknown> = { is_published: true };
  if (opts.city) {
    where.city = { [Op.iLike]: `%${opts.city}%` };
  }
  const rows = await Location.findAll({
    where,
    order: [['updated_at', 'DESC']],
    limit: opts.limit,
    raw: true,
  });
  return rows.map((r) => ({
    ...r,
    lat: r.lat != null ? Number(r.lat) : null,
    lng: r.lng != null ? Number(r.lng) : null,
  }));
}


export async function searchPublishedLocationsFTS(q: string, limit: number) {
  const trimmed = q.trim().slice(0, 200);
  if (trimmed.length < 2) return [];
  const lim = Math.min(50, Math.max(1, Math.floor(limit)));
  const rows = await sequelize.query(
    `SELECT id, title, city, country, lat, lng, category, cover_image_url,
            ts_rank_cd(${FTS_DOC_SQL}, plainto_tsquery('simple', :q)) AS rank
     FROM locations
     WHERE is_published = true
       AND ${FTS_DOC_SQL} @@ plainto_tsquery('simple', :q)
     ORDER BY rank DESC NULLS LAST, updated_at DESC
     LIMIT :lim`,
    { replacements: { q: trimmed, lim }, type: QueryTypes.SELECT },
  );
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: r.id,
    title: r.title,
    city: r.city,
    country: r.country,
    lat: r.lat != null ? Number(r.lat) : null,
    lng: r.lng != null ? Number(r.lng) : null,
    category: r.category,
    cover_image_url: r.cover_image_url ?? null,
  }));
}
