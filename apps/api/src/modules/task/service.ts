import type { Task } from '@xnuxuz/db';
import { db } from '../../db.js';
import { AppError } from '../../http/errors.js';
import { assertValidRrule, nextOccurrence } from '../../lib/recurrence.js';
import { assertCategoryOwned } from '../category/ownership.js';
import { offsetsFromJson, resolveOffsets } from '../reminder/offsets.js';
import { resetReminders } from '../reminder/service.js';
import type { CreateTaskInput, ListTaskQuery, UpdateTaskInput } from './schemas.js';

function reminderTimes(deadline: Date | null, offsets: number[]): Date[] {
  if (!deadline) return [];
  return offsets.map((minutes) => new Date(deadline.getTime() - minutes * 60_000));
}

export async function listTasks(userId: string, query: ListTaskQuery): Promise<Task[]> {
  return db.task.findMany({
    where: {
      userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.dueBefore ? { deadline: { lte: new Date(query.dueBefore) } } : {}),
      ...(query.q ? { title: { contains: query.q } } : {}),
    },
    // Deadline terdekat dulu; task tanpa deadline turun ke bawah.
    orderBy: [{ deadline: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: query.limit,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
}

export async function getTask(userId: string, id: string): Promise<Task> {
  const task = await db.task.findFirst({ where: { id, userId } });
  if (!task) throw AppError.notFound('Task tidak ditemukan');
  return task;
}

export async function createTask(userId: string, input: CreateTaskInput): Promise<Task> {
  if (input.categoryId) await assertCategoryOwned(userId, input.categoryId, 'task');

  const deadline = input.deadline ? new Date(input.deadline) : null;
  if (input.rrule) assertValidRrule(input.rrule, deadline ?? new Date());

  const offsets = await resolveOffsets(input.reminderOffsets, input.categoryId);

  const task = await db.task.create({
    data: {
      userId,
      title: input.title,
      description: input.description ?? null,
      categoryId: input.categoryId ?? null,
      priority: input.priority,
      deadline,
      rrule: input.rrule ?? null,
      reminderOffsets: offsets,
    },
  });

  await resetReminders(userId, 'task', task.id, reminderTimes(deadline, offsets));

  return task;
}

export async function updateTask(
  userId: string,
  id: string,
  input: UpdateTaskInput,
): Promise<Task> {
  const existing = await getTask(userId, id);
  if (input.categoryId) await assertCategoryOwned(userId, input.categoryId, 'task');

  const deadline =
    input.deadline === undefined
      ? existing.deadline
      : input.deadline
        ? new Date(input.deadline)
        : null;

  if (input.rrule) assertValidRrule(input.rrule, deadline ?? new Date());

  const offsets = input.reminderOffsets ?? offsetsFromJson(existing.reminderOffsets);

  const task = await db.task.update({
    where: { id },
    data: {
      ...(input.reminderOffsets === undefined ? {} : { reminderOffsets: offsets }),
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.description === undefined ? {} : { description: input.description ?? null }),
      ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId ?? null }),
      ...(input.priority === undefined ? {} : { priority: input.priority }),
      ...(input.rrule === undefined ? {} : { rrule: input.rrule ?? null }),
      ...(input.deadline === undefined ? {} : { deadline }),
      ...(input.status === undefined
        ? {}
        : {
            status: input.status,
            completedAt: input.status === 'done' ? new Date() : null,
          }),
    },
  });

  // Reminder dijadwal ulang hanya kalau memang ada yang berubah relevan.
  if (input.reminderOffsets !== undefined || input.deadline !== undefined) {
    await resetReminders(userId, 'task', id, reminderTimes(deadline, offsets));
  }

  return task;
}

/**
 * Menyelesaikan task. Kalau task berulang, kemunculan berikutnya langsung
 * dibuat — jadi "task recurring" tidak butuh scheduler tersendiri (§3.3).
 */
export async function completeTask(
  userId: string,
  id: string,
): Promise<{ task: Task; next: Task | null }> {
  const existing = await getTask(userId, id);
  if (existing.status === 'done') throw AppError.conflict('Task sudah selesai');

  const task = await db.task.update({
    where: { id },
    data: { status: 'done', completedAt: new Date() },
  });

  await resetReminders(userId, 'task', id, []);

  if (!existing.rrule || !existing.deadline) return { task, next: null };

  const nextDeadline = nextOccurrence(existing.rrule, existing.deadline, existing.deadline);
  if (!nextDeadline) return { task, next: null };

  const next = await db.task.create({
    data: {
      userId,
      title: existing.title,
      description: existing.description,
      categoryId: existing.categoryId,
      priority: existing.priority,
      deadline: nextDeadline,
      rrule: existing.rrule,
      reminderOffsets: existing.reminderOffsets ?? undefined,
    },
  });

  await resetReminders(
    userId,
    'task',
    next.id,
    reminderTimes(nextDeadline, offsetsFromJson(existing.reminderOffsets)),
  );

  return { task, next };
}

export async function deleteTask(userId: string, id: string): Promise<void> {
  const result = await db.task.deleteMany({ where: { id, userId } });
  if (result.count === 0) throw AppError.notFound('Task tidak ditemukan');
  await resetReminders(userId, 'task', id, []);
}
