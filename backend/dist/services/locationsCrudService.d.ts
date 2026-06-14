export declare function listPublishedLocations(opts: {
    limit: number;
    city?: string;
}): Promise<{
    lat: number | null;
    lng: number | null;
    id: string;
    title: string;
    city: string;
    country: string;
    category: string;
    cover_image_url: string | null;
    is_online_available: boolean;
    is_published: boolean;
    created_by: string;
    _attributes: any;
    dataValues: any;
    _creationAttributes: any;
    isNewRecord: boolean;
    sequelize: import("sequelize").Sequelize;
    _model: import("sequelize").Model<any, any>;
}[]>;
export declare function searchPublishedLocationsFTS(q: string, limit: number): Promise<{
    id: unknown;
    title: unknown;
    city: unknown;
    country: unknown;
    lat: number | null;
    lng: number | null;
    category: unknown;
    cover_image_url: {} | null;
}[]>;
//# sourceMappingURL=locationsCrudService.d.ts.map