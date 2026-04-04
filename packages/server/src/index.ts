import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadConfig } from './config.js';
import { getDb, closeDb } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { authRoutes, authHook } from './api/auth.js';
import { jobRoutes } from './api/jobs.js';
import { executionRoutes } from './api/executions.js';
import { configRoutes } from './api/config.js';
import { startScheduler, stopAllTasks } from './scheduler/index.js';

async function main() {
  const config = loadConfig();

  const db = getDb();
  runMigrations(db);

  const app = Fastify({ logger: true });

  await app.register(fastifyCors, { origin: true });

  await authHook(app);
  await app.register(authRoutes);
  await app.register(jobRoutes);
  await app.register(executionRoutes);
  await app.register(configRoutes);

  const webDist = resolve(process.cwd(), 'packages', 'web', 'dist');
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: '/',
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({ error: 'Not Found' });
      }
      return reply.sendFile('index.html');
    });
  }

  startScheduler();

  const shutdown = async () => {
    console.log('シャットダウン中...');
    stopAllTasks();
    await app.close();
    closeDb();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ port: config.server.port, host: config.server.host });
  console.log(`Pi-lot サーバー起動: http://${config.server.host}:${config.server.port}`);
}

main().catch((err) => {
  console.error('起動エラー:', err);
  process.exit(1);
});
