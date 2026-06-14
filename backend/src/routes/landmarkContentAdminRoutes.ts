import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/adminMiddleware.js';
import { adminActionRateLimiter } from '../middleware/rateLimits.js';
import { config } from '../config.js';
import {
  getLandmarkContentBundle,
  hasLandmarkContentBundle,
  listLandmarkMedia,
  saveLandmarkContentBundle,
  saveLandmarkMedia,
  removeLandmarkMedia,
} from '../services/landmarkContentAdminService.js';
import { publishLandmarkBundleToFirestore } from '../services/landmarkContentFirestorePublisher.js';
import { HttpError } from '../errors/HttpError.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxLandmarkMediaBytes, files: 1 },
});

const router = Router();

router.get(
  '/bundle',
  adminActionRateLimiter,
  authenticateToken,
  requireAdmin,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      if (!(await hasLandmarkContentBundle())) {
        res.status(200).json({ ok: true, empty: true, bundle: null });
        return;
      }
      const bundle = await getLandmarkContentBundle();
      res.status(200).json({ ok: true, empty: false, bundle });
    } catch (e) {
      next(e);
    }
  },
);

router.put(
  '/bundle',
  adminActionRateLimiter,
  authenticateToken,
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.body || typeof req.body !== 'object') {
        next(new HttpError(400, 'invalid_body'));
        return;
      }
      await saveLandmarkContentBundle(req.body);
      const firestore = await publishLandmarkBundleToFirestore(req.body);
      res.status(200).json({ ok: true, firestore });
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  '/media',
  adminActionRateLimiter,
  authenticateToken,
  requireAdmin,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const items = await listLandmarkMedia();
      res.status(200).json({ items });
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  '/media',
  adminActionRateLimiter,
  authenticateToken,
  requireAdmin,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const f = req.file;
      if (!f || !f.buffer) {
        next(new HttpError(400, 'file_required'));
        return;
      }
      const out = await saveLandmarkMedia(f.buffer, f.originalname || 'upload.jpg');
      res.status(201).json({ ok: true, fileName: out.fileName, url: out.url });
    } catch (e) {
      next(e);
    }
  },
);

router.delete(
  '/media/:name',
  adminActionRateLimiter,
  authenticateToken,
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const name = decodeURIComponent(String(req.params.name ?? '')).trim();
      if (!name) {
        next(new HttpError(400, 'name_required'));
        return;
      }
      await removeLandmarkMedia(name);
      res.status(200).json({ ok: true });
    } catch (e) {
      next(e);
    }
  },
);

export const landmarkContentAdminRouter = router;
