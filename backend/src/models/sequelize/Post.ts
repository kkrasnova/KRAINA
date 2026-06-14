import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../db/sequelize.js';

export class Post extends Model {
  declare id: string;
  declare user_id: string;
  declare route_id: string | null;
  declare location_id: string | null;
  declare content_text: string | null;
  declare media_urls: string[];
  declare visibility: string;
  declare likes_count: number;
  declare comments_count: number;
  declare place_label: string | null;
  declare lat: number | null;
  declare lng: number | null;
  declare route_plan: Record<string, unknown> | null;
}

Post.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    user_id: { type: DataTypes.UUID, allowNull: false },
    route_id: DataTypes.UUID,
    location_id: DataTypes.UUID,
    content_text: DataTypes.TEXT,
    media_urls: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false, defaultValue: [] },
    visibility: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'public' },
    likes_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    comments_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    place_label: DataTypes.TEXT,
    lat: DataTypes.DOUBLE,
    lng: DataTypes.DOUBLE,
    route_plan: DataTypes.JSONB,
  },
  {
    sequelize,
    tableName: 'posts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  },
);
