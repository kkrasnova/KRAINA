import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';
import { logger } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id serial PRIMARY KEY,
        name text NOT NULL UNIQUE,
        run_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const dir = path.join(__dirname, '../migrations/sql');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

    for (const name of files) {
      const done = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
      if (done.rowCount) {
        logger.debug(`Skip migration ${name}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(dir, name), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        logger.info(`Applied migration ${name}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
    logger.info('Migrations complete');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((e) => {
  logger.error('Migration failed', e);
  process.exit(1);
});
