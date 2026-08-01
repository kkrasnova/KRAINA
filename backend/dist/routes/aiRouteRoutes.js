import { Router } from 'express';
import { optionalAuth } from '../middleware/authMiddleware.js';
import { aiRouteSuggestRateLimiter, landmarkTtsRateLimiter, visionLandmarkRateLimiter, walkNarrateRateLimiter, } from '../middleware/rateLimits.js';
import { aiSuggestRouteBodySchema, landmarkTtsBodySchema, visionLandmarkBodySchema, walkNarrateBodySchema, } from '../schemas/aiRoute.schemas.js';
import { suggestAiRoute } from '../services/aiRouteSuggestService.js';
import { synthesizeLandmarkSpeech } from '../services/landmarkTtsService.js';
import { detectVisionLandmarkTitle } from '../services/visionLandmarkService.js';
import { narrateWalkGuide } from '../services/walkNarrateService.js';
import { HttpError } from '../errors/HttpError.js';
import { config } from '../config.js';
const router = Router();
router.post('/suggest-route', optionalAuth, aiRouteSuggestRateLimiter, async (req, res, next) => {
    try {
        const body = aiSuggestRouteBodySchema.parse(req.body);
        const out = await suggestAiRoute({
            place: body.place,
            hours: body.hours,
            transport: body.transport,
            interests: body.interests ?? undefined,
            budgetTier: body.budgetTier,
            language: body.language,
            userOrigin: body.userOrigin ?? undefined,
        });
        res.status(200).json({
            routePlan: out.routePlan,
            usedAi: out.usedAi,
            ...(out.rationale ? { rationale: out.rationale } : {}),
        });
    }
    catch (e) {
        next(e);
    }
});
router.post('/vision-landmark', optionalAuth, visionLandmarkRateLimiter, async (req, res, next) => {
    try {
        const body = visionLandmarkBodySchema.parse(req.body);
        if (!config.googleVisionApiKey) {
            throw new HttpError(503, 'vision_not_configured');
        }
        const title = await detectVisionLandmarkTitle(body.base64);
        res.status(200).json({ title });
    }
    catch (e) {
        next(e);
    }
});
router.post('/landmark-tts', optionalAuth, landmarkTtsRateLimiter, async (req, res, next) => {
    try {
        const body = landmarkTtsBodySchema.parse(req.body);
        const out = await synthesizeLandmarkSpeech(body.text, body.language);
        res.status(200).json(out);
    }
    catch (e) {
        next(e);
    }
});
router.post('/walk-narrate', optionalAuth, walkNarrateRateLimiter, async (req, res, next) => {
    try {
        const body = walkNarrateBodySchema.parse(req.body);
        const out = await narrateWalkGuide({
            title: body.title,
            extract: body.extract,
            street: body.street,
            city: body.city,
            language: body.language,
        });
        res.status(200).json(out);
    }
    catch (e) {
        next(e);
    }
});
export const aiRouteRouter = router;
//# sourceMappingURL=aiRouteRoutes.js.map