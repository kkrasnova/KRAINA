import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../db/sequelize.js';
export class Location extends Model {
}
Location.init({
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    title: { type: DataTypes.TEXT, allowNull: false },
    city: { type: DataTypes.TEXT, allowNull: false },
    country: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'Ukraine' },
    lat: { type: DataTypes.DECIMAL(9, 6), allowNull: false },
    lng: { type: DataTypes.DECIMAL(9, 6), allowNull: false },
    category: { type: DataTypes.TEXT, allowNull: false },
    cover_image_url: DataTypes.TEXT,
    is_online_available: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    is_published: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    created_by: { type: DataTypes.UUID, allowNull: false },
}, {
    sequelize,
    tableName: 'locations',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});
//# sourceMappingURL=Location.js.map