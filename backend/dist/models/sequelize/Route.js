import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../db/sequelize.js';
export class Route extends Model {
}
Route.init({
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    user_id: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.TEXT, allowNull: false },
    description: DataTypes.TEXT,
    cover_image_url: DataTypes.TEXT,
    type: { type: DataTypes.TEXT, allowNull: false },
    duration_min: DataTypes.INTEGER,
    distance_m: DataTypes.INTEGER,
    budget_level: DataTypes.TEXT,
    city: DataTypes.TEXT,
    is_public: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    is_saved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    likes_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, {
    sequelize,
    tableName: 'routes',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
});
//# sourceMappingURL=Route.js.map