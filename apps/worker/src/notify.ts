import { getDb } from '@xnuxuz/db';
import { NotificationService, type SmtpConfig } from '@xnuxuz/notify';
import { env, logger } from './config.js';

function smtpConfig(): SmtpConfig | null {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) return null;
  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    from: env.SMTP_FROM ?? env.SMTP_USER,
  };
}

/** Satu instance untuk seluruh proses worker — adapter-nya stateless kecuali transport SMTP. */
export const notifications = new NotificationService({
  db: getDb(env.DATABASE_URL),
  telegramBotToken: env.TELEGRAM_BOT_TOKEN,
  smtp: smtpConfig(),
  logger,
});
