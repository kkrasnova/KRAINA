import { Post } from '../models/sequelize/index.js';

export async function createPostViaSequelize(
  userId: string,
  body: {
    media_urls: string[];
    content_text?: string | null;
    visibility: 'public' | 'followers' | 'private';
    place_label?: string | null;
    lat?: number | null;
    lng?: number | null;
    route_plan?: Record<string, unknown> | null;
    route_id?: string | null;
    location_id?: string | null;
  },
) {
  const row = await Post.create({
    user_id: userId,
    route_id: body.route_id ?? null,
    location_id: body.location_id ?? null,
    content_text: body.content_text?.trim() || null,
    media_urls: body.media_urls,
    visibility: body.visibility,
    place_label: body.place_label?.trim() || null,
    lat: body.lat != null && Number.isFinite(body.lat) ? body.lat : null,
    lng: body.lng != null && Number.isFinite(body.lng) ? body.lng : null,
    route_plan: body.route_plan ?? null,
  });
  return row.get({ plain: true });
}
