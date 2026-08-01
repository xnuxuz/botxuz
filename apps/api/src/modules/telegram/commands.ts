import { db } from '../../db.js';
import { AppError } from '../../http/errors.js';
import { dropPending } from '../ai/pending.js';
import { confirmPending, handleMessage } from '../ai/service.js';
import { composeBriefing } from '../briefing/service.js';
import { completeTask, createTask, listTasks } from '../task/service.js';

export type CommandInput = { telegramChatId: string; command: string; args: string };

export type CommandReply = {
  text: string;
  /** Kalau ada, bot menampilkan tombol konfirmasi ✅ ✏️ ❌ (§3.5). */
  confirm?: { pendingId: string } | null;
};

const NOT_LINKED: CommandReply = {
  text: 'Akun ini belum terhubung. Ambil kode di dashboard lalu kirim /link <kode>.',
};

/**
 * Router perintah bot. Semua di sini, bukan di worker, supaya bot tetap tipis
 * dan perilaku yang sama bisa dipakai ulang oleh client lain (§2).
 */
export async function handleTelegramCommand(input: CommandInput): Promise<CommandReply> {
  const user = await userOf(input.telegramChatId);
  if (!user) return NOT_LINKED;

  const args = input.args.trim();

  switch (input.command) {
    case 'today':
      return today(user.id);
    case 'tasks':
      return tasks(user.id, user.timezone);
    case 'task':
      return addTask(user.id, args);
    case 'done':
      return done(user.id, args);
    default:
      return { text: `Perintah /${input.command} belum dikenal. Coba /help.` };
  }
}

async function today(userId: string): Promise<CommandReply> {
  const briefing = await composeBriefing(userId);
  return { text: briefing ? `${briefing.title}\n\n${briefing.body}` : 'Tidak ada data.' };
}

async function tasks(userId: string, timezone: string): Promise<CommandReply> {
  const open = await listTasks(userId, { status: 'todo', limit: 10 });
  if (open.length === 0) return { text: 'Tidak ada task terbuka. 🎉' };

  const lines = open.map((task, index) => {
    const due = task.deadline
      ? ` — ${new Intl.DateTimeFormat('id-ID', {
          timeZone: timezone,
          day: 'numeric',
          month: 'short',
        }).format(task.deadline)}`
      : '';
    // Nomor urut dipakai /done <nomor>, jauh lebih enak diketik daripada UUID.
    return `${index + 1}. ${task.title}${due}`;
  });

  return { text: `Task terbuka:\n${lines.join('\n')}\n\nSelesaikan dengan /done <nomor>` };
}

async function addTask(userId: string, args: string): Promise<CommandReply> {
  if (!args) return { text: 'Formatnya: /task <judul>' };

  const task = await createTask(userId, { title: args.slice(0, 200), priority: 'medium' });
  return { text: `Task dibuat: ${task.title}` };
}

async function done(userId: string, args: string): Promise<CommandReply> {
  const index = Number.parseInt(args, 10);
  if (!Number.isInteger(index) || index < 1) {
    return { text: 'Formatnya: /done <nomor dari /tasks>' };
  }

  const open = await listTasks(userId, { status: 'todo', limit: 10 });
  const target = open[index - 1];
  if (!target) return { text: `Tidak ada task nomor ${index}.` };

  const { next } = await completeTask(userId, target.id);
  const followUp = next?.deadline
    ? `\nBerikutnya dijadwalkan ${next.deadline.toISOString().slice(0, 10)}.`
    : '';

  return { text: `Selesai: ${target.title} ✅${followUp}` };
}

/**
 * Pesan bebas: langsung ke intent router. Aksi write tidak pernah langsung
 * dieksekusi — selalu lewat kartu konfirmasi (§3.5).
 */
export async function handleTelegramMessage(input: {
  telegramChatId: string;
  text: string;
}): Promise<CommandReply> {
  const user = await userOf(input.telegramChatId);
  if (!user) return NOT_LINKED;

  try {
    const reply = await handleMessage(user.id, input.text);

    switch (reply.kind) {
      case 'confirm':
        return {
          text: `Konfirmasi dulu ya:\n\n${reply.pending.preview}`,
          confirm: { pendingId: reply.pending.id },
        };
      case 'result':
        return { text: reply.summary };
      case 'text':
        return { text: reply.text };
    }
  } catch (error) {
    if (error instanceof AppError) return { text: error.message };
    throw error;
  }
}

export async function handleTelegramCallback(input: {
  telegramChatId: string;
  action: 'confirm' | 'reject';
  pendingId: string;
}): Promise<CommandReply> {
  const user = await userOf(input.telegramChatId);
  if (!user) return NOT_LINKED;

  try {
    if (input.action === 'reject') {
      await dropPending(user.id, input.pendingId);
      return { text: 'Dibatalkan. ❌' };
    }

    const result = await confirmPending(user.id, input.pendingId);
    return { text: `${result.summary} ✅` };
  } catch (error) {
    if (error instanceof AppError) return { text: error.message };
    throw error;
  }
}

async function userOf(telegramChatId: string) {
  return db.user.findUnique({
    where: { telegramChatId },
    select: { id: true, timezone: true },
  });
}
