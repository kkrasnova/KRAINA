import { Model } from 'sequelize';
export declare class Route extends Model {
    id: string;
    user_id: string;
    title: string;
    description: string | null;
    cover_image_url: string | null;
    type: string;
    duration_min: number | null;
    distance_m: number | null;
    budget_level: string | null;
    city: string | null;
    is_public: boolean;
    is_saved: boolean;
    likes_count: number;
}
//# sourceMappingURL=Route.d.ts.map