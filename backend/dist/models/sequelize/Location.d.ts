import { Model } from 'sequelize';
export declare class Location extends Model {
    id: string;
    title: string;
    city: string;
    country: string;
    lat: string;
    lng: string;
    category: string;
    cover_image_url: string | null;
    is_online_available: boolean;
    is_published: boolean;
    created_by: string;
}
//# sourceMappingURL=Location.d.ts.map