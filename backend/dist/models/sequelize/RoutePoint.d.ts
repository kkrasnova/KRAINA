import { Model } from 'sequelize';
export declare class RoutePoint extends Model {
    id: string;
    route_id: string;
    location_id: string;
    point_order: number;
    planned_min: number | null;
    notes: string | null;
}
//# sourceMappingURL=RoutePoint.d.ts.map