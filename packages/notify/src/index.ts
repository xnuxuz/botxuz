export { EmailAdapter, type SmtpConfig } from './adapters/email.js';
export { TelegramAdapter } from './adapters/telegram.js';
export {
  isWithinQuietHours,
  localMinuteOfDay,
  type QuietWindow,
  quietHoursEndAt,
} from './quiet-hours.js';
export {
  NotificationService,
  type NotificationServiceConfig,
  type SendOptions,
  type SendResult,
} from './service.js';
