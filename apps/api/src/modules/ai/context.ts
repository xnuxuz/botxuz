import { formatRupiah } from '@xnuxuz/shared';
import { db } from '../../db.js';
import { localDayBounds } from '../briefing/time.js';
import { getSchedule } from '../event/service.js';

/**
 * Context assembler (REQUIREMENT §3.5). Urutannya sengaja: fakta permanen dulu,
 * lalu kondisi hari ini, lalu correction rules sebagai override deterministik —
 * aturan yang datang belakangan harus terbaca sebagai yang paling mengikat.
 * RAG episodic menyusul di fase berikutnya.
 */

const MAX_FACTS = 30;
const MAX_ITEMS = 8;

export type AssembledContext = {
  systemPrompt: string;
  /** Nama kategori yang tersedia — dipakai juga oleh parser fallback. */
  financeCategories: string[];
  taskCategories: string[];
  timezone: string;
};

export async function assembleContext(userId: string, now = new Date()): Promise<AssembledContext> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { displayName: true, timezone: true },
  });
  const timezone = user?.timezone ?? 'Asia/Jakarta';
  const { start, end } = localDayBounds(now, timezone);

  const [facts, rules, categories, tasks, accounts, occurrences] = await Promise.all([
    db.userFact.findMany({
      where: { userId },
      orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }],
      take: MAX_FACTS,
    }),
    db.correctionRule.findMany({
      where: { userId },
      orderBy: { hitCount: 'desc' },
      take: MAX_FACTS,
    }),
    db.category.findMany({
      where: { userId, archivedAt: null },
      select: { name: true, domain: true },
    }),
    db.task.findMany({
      where: { userId, status: { in: ['todo', 'in_progress'] } },
      orderBy: [{ priority: 'desc' }, { deadline: { sort: 'asc', nulls: 'last' } }],
      take: MAX_ITEMS,
      select: { title: true, priority: true, deadline: true },
    }),
    db.account.findMany({
      where: { userId, archivedAt: null },
      select: { name: true, balanceCached: true },
    }),
    getSchedule(userId, start, end),
  ]);

  const financeCategories = categories
    .filter((category) => category.domain === 'finance')
    .map((category) => category.name);
  const taskCategories = categories
    .filter((category) => category.domain === 'task')
    .map((category) => category.name);

  const clock = new Intl.DateTimeFormat('id-ID', {
    timeZone: timezone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(now);

  const sections: string[] = [
    'Kamu adalah asisten pribadi xnuxuz untuk jadwal, produktivitas, dan keuangan.',
    'Jawab ringkas dalam Bahasa Indonesia. Kalau permintaannya bisa dikerjakan lewat',
    'function yang tersedia, panggil function itu dan jangan mengarang hasilnya.',
    '',
    `Sekarang: ${clock} (${timezone}).`,
    `Nama user: ${user?.displayName ?? 'belum diisi'}.`,
    '',
    `Kategori finance: ${financeCategories.join(', ') || '(belum ada)'}`,
    `Kategori task: ${taskCategories.join(', ') || '(belum ada)'}`,
    `Akun: ${
      accounts
        .map((account) => `${account.name} (${formatRupiah(account.balanceCached)})`)
        .join(', ') || '(belum ada)'
    }`,
  ];

  if (facts.length > 0) {
    sections.push('', 'Fakta tentang user:');
    for (const fact of facts) {
      sections.push(`- ${fact.category}/${fact.key}: ${fact.value}`);
    }
  }

  sections.push('', 'Jadwal hari ini:');
  if (occurrences.length === 0) {
    sections.push('- (kosong)');
  } else {
    for (const occurrence of occurrences.slice(0, MAX_ITEMS)) {
      const time = new Intl.DateTimeFormat('id-ID', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
      }).format(occurrence.startAt);
      sections.push(`- ${time} ${occurrence.title}`);
    }
  }

  sections.push('', 'Task terbuka:');
  if (tasks.length === 0) {
    sections.push('- (tidak ada)');
  } else {
    for (const task of tasks) {
      sections.push(`- [${task.priority}] ${task.title}`);
    }
  }

  if (rules.length > 0) {
    sections.push('', 'Aturan koreksi dari user. Ini mengikat dan mengalahkan tebakanmu sendiri:');
    for (const rule of rules) {
      sections.push(`- kalau teks memuat "${rule.pattern}", set ${rule.field} = ${rule.value}`);
    }
  }

  return {
    systemPrompt: sections.join('\n'),
    financeCategories,
    taskCategories,
    timezone,
  };
}

/**
 * Override deterministik (§3.5). Dijalankan setelah LLM menjawab, jadi koreksi
 * user selalu menang — dan hit count naik supaya aturan mati bisa dipangkas.
 */
export async function applyCorrectionRules(
  userId: string,
  text: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const rules = await db.correctionRule.findMany({ where: { userId } });
  if (rules.length === 0) return args;

  const lower = text.toLowerCase();
  const result = { ...args };
  const hits: string[] = [];

  for (const rule of rules) {
    if (!lower.includes(rule.pattern.toLowerCase())) continue;
    result[rule.field] = rule.value;
    hits.push(rule.id);
  }

  if (hits.length > 0) {
    await db.correctionRule.updateMany({
      where: { id: { in: hits } },
      data: { hitCount: { increment: 1 } },
    });
  }

  return result;
}
