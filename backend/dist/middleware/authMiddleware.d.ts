import type { Request, Response, NextFunction } from 'express';
export declare function authenticateToken(req: Request, _res: Response, next: NextFunction): Promise<void>;
export declare function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=authMiddleware.d.ts.map