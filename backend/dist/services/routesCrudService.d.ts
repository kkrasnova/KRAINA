import { Route } from '../models/sequelize/index.js';
export type CreateRoutePointInput = {
    location_id: string;
    point_order: number;
    planned_min?: number | null;
    notes?: string | null;
};
export declare function createRouteForUser(userId: string, body: {
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
}): Promise<Route | null>;
export declare function deleteRouteForUser(userId: string, routeId: string): Promise<boolean>;
//# sourceMappingURL=routesCrudService.d.ts.map