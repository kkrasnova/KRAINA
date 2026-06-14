import type { CorsOptions } from 'cors';
import { config } from './config.js';
import { logger } from './logger.js';


export function buildCorsOptions(): CorsOptions {
  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (config.corsOrigins.length === 0) {
        if (config.nodeEnv === 'production') {
          logger.warn('cors_rejected_browser_no_whitelist', { origin });
          callback(null, false);
          return;
        }
        callback(null, true);
        return;
      }
      if (config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      logger.warn('cors_rejected_origin', { origin });
      callback(null, false);
    },
  };
}
