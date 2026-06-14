import { Router } from 'express';
import { optionalAuth } from '../middleware/authMiddleware.js';
import {
  listPublishedLocations,
  searchPublishedLocationsFTS,
} from '../services/locationsCrudService.js';

const router = Router();


router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const city = typeof req.query.city === 'string' ? req.query.city.trim() : '';
    const locations = await listPublishedLocations({ limit, city: city || undefined });
    res.status(200).json({ locations });
  } catch (e) {
    next(e);
  }
});


router.get('/search', optionalAuth, async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const locations = await searchPublishedLocationsFTS(q, limit);
    res.status(200).json({ locations });
  } catch (e) {
    next(e);
  }
});

export const locationsRouter = router;
