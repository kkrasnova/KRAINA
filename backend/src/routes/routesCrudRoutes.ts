import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { HttpError } from '../errors/HttpError.js';
import { createRouteForUser, deleteRouteForUser } from '../services/routesCrudService.js';

const router = Router();

const createRouteSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional().nullable(),
  type: z.enum(['manual', 'ai_generated']),
  duration_min: z.number().int().positive().optional().nullable(),
  distance_m: z.number().int().nonnegative().optional().nullable(),
  budget_level: z.enum(['free', 'budget', 'mid', 'premium']).optional().nullable(),
  city: z.string().max(200).optional().nullable(),
  is_public: z.boolean().optional(),
  cover_image_url: z.string().url().max(2000).optional().nullable(),
  points: z
    .array(
      z.object({
        location_id: z.string().uuid(),
        point_order: z.number().int().min(0),
        planned_min: z.number().int().optional().nullable(),
        notes: z.string().max(500).optional().nullable(),
      }),
    )
    .max(50)
    .optional(),
});


router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const id = req.authUser?.id;
    if (!id) throw new HttpError(401, 'token_invalid');
    const parsed = createRouteSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'invalid_body');
    }
    const route = await createRouteForUser(id, parsed.data);
    res.status(201).json({ route: route?.toJSON() ?? null });
  } catch (e) {
    next(e);
  }
});


router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const id = req.authUser?.id;
    if (!id) throw new HttpError(401, 'token_invalid');
    const routeId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!z.string().uuid().safeParse(routeId).success) {
      throw new HttpError(400, 'invalid_body');
    }
    await deleteRouteForUser(id, routeId);
    res.status(200).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export const routesCrudRouter = router;
