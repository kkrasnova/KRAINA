import { sequelize, Route, RoutePoint } from '../models/sequelize/index.js';
import { HttpError } from '../errors/HttpError.js';

export type CreateRoutePointInput = {
  location_id: string;
  point_order: number;
  planned_min?: number | null;
  notes?: string | null;
};

export async function createRouteForUser(
  userId: string,
  body: {
    title: string;
    description?: string | null;
    type: 'manual' | 'ai_generated';
    duration_min?: number | null;
    distance_m?: number | null;
    budget_level?: 'free' | 'budget' | 'mid' | 'premium' | null;
    city?: string | null;
    is_public?: boolean;
    cover_image_url?: string | null;
    points?: CreateRoutePointInput[];
  },
) {
  const t = await sequelize.transaction();
  try {
    const route = await Route.create(
      {
        user_id: userId,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        type: body.type,
        duration_min: body.duration_min ?? null,
        distance_m: body.distance_m ?? null,
        budget_level: body.budget_level ?? null,
        city: body.city?.trim() || null,
        is_public: body.is_public ?? false,
        cover_image_url: body.cover_image_url?.trim() || null,
      },
      { transaction: t },
    );
    if (body.points?.length) {
      await RoutePoint.bulkCreate(
        body.points.map((p) => ({
          route_id: route.id,
          location_id: p.location_id,
          point_order: p.point_order,
          planned_min: p.planned_min ?? null,
          notes: p.notes?.trim() || null,
        })),
        { transaction: t },
      );
    }
    await t.commit();
    const full = await Route.findByPk(route.id, {
      include: [{ model: RoutePoint, as: 'points' }],
    });
    return full;
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

export async function deleteRouteForUser(userId: string, routeId: string): Promise<boolean> {
  const n = await Route.destroy({ where: { id: routeId, user_id: userId } });
  if (!n) {
    throw new HttpError(404, 'route_not_found');
  }
  return true;
}
