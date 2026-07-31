import { disconnectDb } from '@xnuxuz/db';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectRedis, redis } from './config/redis.js';

async function main(): Promise<void> {
  await connectRedis();

  const server = createApp().listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API siap menerima request');
  });

  // Graceful shutdown — jangan putus request yang sedang jalan saat redeploy.
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Mematikan API');
    server.close(async () => {
      await Promise.allSettled([disconnectDb(), redis.quit()]);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Gagal menjalankan API');
  process.exit(1);
});
