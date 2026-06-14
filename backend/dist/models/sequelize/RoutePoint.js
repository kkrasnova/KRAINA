import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../db/sequelize.js';
export class RoutePoint extends Model {
}
RoutePoint.init({
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    route_id: { type: DataTypes.UUID, allowNull: false },
    location_id: { type: DataTypes.UUID, allowNull: false },
    point_order: { type: DataTypes.INTEGER, allowNull: false },
    planned_min: DataTypes.INTEGER,
    notes: DataTypes.TEXT,
}, {
    sequelize,
    tableName: 'route_points',
    timestamps: false,
});
//# sourceMappingURL=RoutePoint.js.map