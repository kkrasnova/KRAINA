import { Sequelize } from 'sequelize';
import { config } from '../config.js';


export const sequelize = new Sequelize(config.databaseUrl, {
  dialect: 'postgres',
  logging: false,
  pool: { max: 20, min: 0, idle: 10_000 },
  define: { underscored: false },
});
