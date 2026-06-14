import { Router } from 'express';
import { optionalAuth } from '../middleware/authMiddleware.js';
import { aiRouteSuggestRateLimiter } from '../middleware/rateLimits.js';
import { aiSuggestRouteBodySchema } from '../schemas/aiRoute.schemas.js';
import { suggestAiRoute } from '../services/aiRouteSuggestService.js';
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
export const aiRouteRouter = router;
//# sourceMappingURL=aiRouteRoutes.js.map