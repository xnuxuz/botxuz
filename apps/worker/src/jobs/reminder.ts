import { getDb } from '@xnuxuz/db';
import { NOTIF_TYPES, QUEUES, toJobId } from '@xnuxuz/shared';
import type { Job } from 'bullmq';
import { env, logger } from '../config.js';
import { formatLocalTime } from '../lib/format.js';
import { getQueue } from '../queues.js';
import type { NotificationJob } from './notification.js';

export type ReminderJob = { reminderId: string };

const db = getDb(env.DATABASE_URL);

/**
 * Isi pesan dibaca saat job berjalan, bukan saat dijadwalkan — kalau judul atau
 * lokasi event diubah setelah reminder dibuat, yang terkirim tetap versi terbaru.
 */
export async function processReminder(job: Job<ReminderJob>): Promise<void> {
  const reminder = await db.reminder.findUnique({ where: { id: job.data.reminderId } });

  if (!reminder) {
    logger.warn({ jobId: job.id }, 'Reminder sudah dihapus, job diabaikan');
    return;
  }

  // Event/task yang dibatalkan meninggalkan reminder berstatus cancelled.
  if (reminder.status !== 'pending') {
    logger.info({ reminderId: reminder.id, status: reminder.status }, 'Reminder tidak lagi aktif');
    return;
  }

  const subject = await loadSubject(reminder.refType, reminder.refId, reminder.userId);
  if (!subject) {
    await db.reminder.update({
      where: { id: reminder.id },
      data: { status: 'cancelled', error: 'Referensi sudah dihapus' },
    });
    return;
  }

  const user = await db.user.findUnique({
    where: { id: reminder.userId },
    select: { timezone: true },
  });

  const payload: NotificationJob = {
    userId: reminder.userId,
    notifType: NOTIF_TYPES.reminder,
    channels: [reminder.channel],
    payload: {
      idempotencyKey: `reminder:${reminder.id}`,
      title: subject.at ? `⏰ ${subject.title}` : subject.title,
      body: subject.at
        ? `${subject.label} ${formatLocalTime(subject.at, user?.timezone ?? 'Asia/Jakarta')}${
            subject.location ? `\n📍 ${subject.location}` : ''
          }`
        : subject.label,
    },
  };

  await getQueue(QUEUES.notification).add('dispatch', payload, {
    // Job id deterministik: reminder yang sama tidak pernah jadi dua notifikasi (§3.6).
    jobId: toJobId('notif', 'reminder', reminder.id),
  });

  await db.reminder.update({
    where: { id: reminder.id },
    data: { status: 'sent', sentAt: new Date() },
  });

  logger.info({ reminderId: reminder.id, userId: reminder.userId }, 'Reminder diteruskan');
}

type Subject = { title: string; label: string; at: Date | null; location: string | null };

async function loadSubject(
  refType: 'event' | 'task',
  refId: string,
  userId: string,
): Promise<Subject | null> {
  if (refType === 'event') {
    const event = await db.event.findFirst({ where: { id: refId, userId } });
    if (!event) return null;
    return { title: event.title, label: 'Mulai', at: event.startAt, location: event.location };
  }

  const task = await db.task.findFirst({ where: { id: refId, userId } });
  if (!task || task.status === 'done' || task.status === 'cancelled') return null;
  return {
    title: task.title,
    label: task.deadline ? 'Deadline' : 'Belum selesai',
    at: task.deadline,
    location: null,
  };
}
