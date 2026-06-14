import { Model } from 'sequelize';
export declare class Post extends Model {
    id: string;
    user_id: string;
    route_id: string | null;
    location_id: string | null;
    content_text: string | null;
    media_urls: string[];
    visibility: string;
    likes_count: number;
    comments_count: number;
    place_label: string | null;
    lat: number | null;
    lng: number | null;
    route_plan: Record<string, unknown> | null;
}
//# sourceMappingURL=Post.d.ts.map