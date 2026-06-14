import { HttpError } from '../errors/HttpError.js';
export function requireAdmin(req, _res, next) {
    if (req.authUser?.role !== 'admin') {
        next(new HttpError(403, 'forbidden'));
        return;
    }
    next();
}
//# sourceMappingURL=adminMiddleware.js.map