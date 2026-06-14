import './Location.js';
import './Post.js';
import { Route } from './Route.js';
import { RoutePoint } from './RoutePoint.js';
Route.hasMany(RoutePoint, { foreignKey: 'route_id', as: 'points', onDelete: 'CASCADE' });
RoutePoint.belongsTo(Route, { foreignKey: 'route_id' });
export { sequelize } from '../../db/sequelize.js';
export { Location } from './Location.js';
export { Route } from './Route.js';
export { RoutePoint } from './RoutePoint.js';
export { Post } from './Post.js';
//# sourceMappingURL=index.js.map