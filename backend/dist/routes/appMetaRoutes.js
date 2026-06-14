import { Router } from 'express';
import { config } from '../config.js';
import { getLandmarkContentBundle, hasLandmarkContentBundle, } from '../services/landmarkContentAdminService.js';
const router = Router();
router.get('/version', (_req, res) => {
    const min = config.minSupportedAppVersion.trim();
    res.status(200).json({
        min_supported_version: min.length ? min : null,
        ios_store_url: config.iosAppStoreUrl.trim() || null,
        android_store_url: config.androidPlayStoreUrl.trim() || null,
        website_url: config.publicBaseUrl || null,
    });
});
router.get('/landmark-content/bundle', async (_req, res, next) => {
    try {
        if (!config.landmarkBundlePublicGet) {
            res.status(404).json({ ok: false, error: 'disabled' });
            return;
        }
        if (!(await hasLandmarkContentBundle())) {
            res.status(404).json({ ok: false, error: 'not_configured' });
            return;
        }
        const bundle = await getLandmarkContentBundle();
        res.status(200).json(bundle);
    }
    catch (e) {
        next(e);
    }
});
export const appMetaRouter = router;
//# sourceMappingURL=appMetaRoutes.js.map