import { config } from './config.js';
import { createApp } from './app.js';
import { logger } from './logger.js';
import { pool } from './db/pool.js';
import { runStartupChecks } from './startupChecks.js';
import { initStorageProvider, destroyStorageProvider } from './storage/index.js';
import { startCleanupJobs, stopCleanupJobs } from './workers/cleanupJobs.js';
import { initWsServer } from './services/wsService.js';
// Initialise the storage provider (local disk or S3) before anything else.
initStorageProvider();
// Emit startup warnings for missing or misconfigured env vars.
// This is advisory-only — warnings are logged but startup is not aborted.
runStartupChecks();
const app = createApp();
const server = app.listen(config.port, () => {
    logger.info(`KRAÏNA API listening on port ${config.port}`);
    // Initialise WebSocket server on the same HTTP server
    initWsServer(server);
    startCleanupJobs();
});
// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
// Sequence on SIGTERM / SIGINT:
//   1. Stop accepting new HTTP connections (server.close).
//   2. Stop scheduling new cleanup job runs (existing runs finish naturally).
//   3. Close the PostgreSQL pool (waits for in-flight queries to complete).
//   4. Exit 0.
// A hard timeout forces exit(1) if shutdown takes longer than SHUTDOWN_TIMEOUT_MS.
// This prevents a container from hanging indefinitely during a rolling deploy.
const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;
function shutdown(signal) {
    if (shuttingDown)
        return;
    shuttingDown = true;
    logger.info(`shutdown.initiated`, { signal, timeout_ms: SHUTDOWN_TIMEOUT_MS });
    // Hard-exit guard — fires if graceful shutdown stalls
    const forceExit = setTimeout(() => {
        logger.error('shutdown.timeout', {
            signal,
            timeout_ms: SHUTDOWN_TIMEOUT_MS,
            hint: 'Forcing exit(1). Check for long-running queries or hanging HTTP connections.',
        });
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    // .unref() so this timer does not prevent Node from exiting if shutdown
    // completes before the timeout fires.
    forceExit.unref();
    // Step 1: stop accepting new connections
    server.close(() => {
        logger.info('shutdown.http_closed');
    });
    // Step 2: stop cleanup job intervals
    stopCleanupJobs();
    // Step 2.5: close the storage provider (S3 client connections)
    destroyStorageProvider();
    // Step 3: drain the PostgreSQL pool
    pool
        .end()
        .then(() => {
        logger.info('shutdown.pg_pool_closed');
        process.exit(0);
    })
        .catch((e) => {
        logger.error('shutdown.pg_pool_error', {
            err: e instanceof Error ? e.message : String(e),
        });
        process.exit(1);
    });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
//# sourceMappingURL=index.js.map