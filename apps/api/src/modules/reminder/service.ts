import type { NotificationChannel, ReminderRefType } from '@xnuxuz/db';
import { toJobId } from '@xnuxuz/shared';
import { logger } from '../../config/logger.js';
import { db } from '../../db.js';
import { getQueue, QUEUES } from '../../queue.js';

export type ScheduleInput = {
  userId: string;
  refType: ReminderRefType;
  refId: string;
  fireAt: Date;
  channel?: NotificationChannel;
};

/** Job id deterministik dari id reminder — dipakai untuk cancel dan anti-double-fire (§3.6). */
const jobIdFor = (reminderId: string) => toJobId('rem', reminderId);

/**
 * Reminder disimpan di MySQL (sumber kebenaran, tahan restart Redis) sekaligus
 * dijadwalkan sebagai delayed job BullMQ. Baris DB dibuat lebih dulu supaya
 * job selalu punya rujukan yang valid saat dieksekusi.
 */
export async function scheduleReminder(input: ScheduleInput): Promise<string> {
  const reminder = await db.reminder.create({
    data: {
      userId: input.userId,
      refType: input.refType,
      refId: input.refId,
      fireAt: input.fireAt,
      ...(input.channel ? { channel: input.channel } : {}),
    },
  });

  const jobId = jobIdFor(reminder.id);
  const delay = Math.max(input.fireAt.getTime() - Date.now(), 0);

  try {
    await getQueue(QUEUES.reminder).add('fire', { reminderId: reminder.id }, { delay, jobId });
  } catch (error) {
    // Tanpa rollback, barisnya tertinggal berstatus pending padahal tidak ada
    // job yang akan membangunkannya — reminder hantu yang tidak pernah bunyi.
    await db.reminder.delete({ where: { id: reminder.id } });
    throw error;
  }

  await db.reminder.update({ where: { id: reminder.id }, data: { jobId } });

  return reminder.id;
}

/**
 * Dipanggil saat event/task digeser atau dihapus. Job BullMQ ikut dibuang —
 * kalau hanya baris DB yang ditandai cancelled, job-nya tetap meledak nanti.
 */
export async function cancelRemindersFor(
  userId: string,
  refType: ReminderRefType,
  refId: string,
): Promise<number> {
  const pending = await db.reminder.findMany({
    where: { userId, refType, refId, status: 'pending' },
    select: { id: true, jobId: true },
  });

  if (pending.length === 0) return 0;

  const queue = getQueue(QUEUES.reminder);
  await Promise.all(
    pending.map(async (reminder) => {
      if (!reminder.jobId) return;
      try {
        await queue.remove(reminder.jobId);
      } catch (error) {
        // Job yang sudah jalan/hilang bukan kegagalan — status DB tetap dibereskan.
        logger.debug({ err: error, jobId: reminder.jobId }, 'Job reminder tidak bisa dihapus');
      }
    }),
  );

  const result = await db.reminder.updateMany({
    where: { id: { in: pending.map((reminder) => reminder.id) } },
    data: { status: 'cancelled' },
  });

  return result.count;
}

/** Ganti seluruh reminder sebuah ref dengan jadwal baru (dipakai saat update event/task). */
export async function resetReminders(
  userId: string,
  refType: ReminderRefType,
  refId: string,
  fireTimes: Date[],
): Promise<void> {
  await cancelRemindersFor(userId, refType, refId);

  const now = Date.now();
  await Promise.all(
    fireTimes
      // Waktu yang sudah lewat tidak dijadwalkan ulang — tidak ada gunanya mengingatkan masa lalu.
      .filter((fireAt) => fireAt.getTime() > now)
      .map((fireAt) => scheduleReminder({ userId, refType, refId, fireAt })),
  );
}
