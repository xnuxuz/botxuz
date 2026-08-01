import {
  isWriteTool,
  type LlmProvider,
  LlmRateLimitError,
  LlmUnavailableError,
  TOOL_DEFINITIONS,
} from '@xnuxuz/ai';
import { formatRupiah } from '@xnuxuz/shared';
import { logger } from '../../config/logger.js';
import { AppError } from '../../http/errors.js';
import { applyCorrectionRules, assembleContext } from './context.js';
import { executeTool } from './executor.js';
import { parseQuickEntry } from './fallback.js';
import { type PendingAction, savePending, takePending } from './pending.js';
import { getLlm } from './provider.js';

export type AssistantReply =
  /** Aksi write menunggu konfirmasi user (§3.5). */
  | { kind: 'confirm'; pending: PendingAction }
  | { kind: 'result'; summary: string; data: unknown }
  | { kind: 'text'; text: string };

/**
 * Intent router (§3.5). Jalur deterministik dicoba lebih dulu: quick entry
 * finance adalah kasus paling sering, dan menyelesaikannya tanpa LLM berarti
 * hemat kuota sekaligus tetap jalan saat provider down (§5.3).
 */
export async function handleMessage(userId: string, text: string): Promise<AssistantReply> {
  const trimmed = text.trim();
  if (!trimmed) throw AppError.badRequest('Pesan kosong');

  const context = await assembleContext(userId);

  const quick = parseQuickEntry(trimmed, context.financeCategories);
  if (quick) {
    return confirmTransaction(userId, trimmed, {
      type: quick.type,
      amount: quick.amountInt,
      category: quick.categoryHint ?? undefined,
      note: quick.note,
    });
  }

  const llm = getLlm();
  if (!llm) {
    throw AppError.badRequest(
      'Belum paham maksudnya, dan asisten AI belum aktif. ' +
        'Coba format seperti: "keluar 25rb makan siang".',
    );
  }

  return askLlm(llm, userId, trimmed, context.systemPrompt);
}

async function askLlm(
  llm: LlmProvider,
  userId: string,
  text: string,
  systemPrompt: string,
): Promise<AssistantReply> {
  let response: Awaited<ReturnType<LlmProvider['complete']>>;

  try {
    response = await llm.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      tools: TOOL_DEFINITIONS,
      temperature: 0.2,
    });
  } catch (error) {
    if (error instanceof LlmRateLimitError || error instanceof LlmUnavailableError) {
      logger.warn({ err: error }, 'LLM tidak tersedia, jatuh ke jalur deterministik');
      throw AppError.badRequest(
        'Asisten AI sedang tidak tersedia. Coba format ringkas seperti "keluar 25rb makan".',
      );
    }
    throw error;
  }

  const call = response.toolCalls[0];
  if (!call) {
    return { kind: 'text', text: response.text ?? 'Belum paham maksudnya.' };
  }

  // Correction rules menang atas tebakan LLM (§3.5).
  const args = await applyCorrectionRules(userId, text, call.arguments);

  if (!isWriteTool(call.name)) {
    const result = await executeTool(userId, call.name, args);
    return { kind: 'result', summary: result.summary, data: result.data };
  }

  const pending = await savePending(userId, {
    tool: call.name,
    args,
    sourceText: text,
    preview: previewOf(call.name, args),
  });

  return { kind: 'confirm', pending };
}

async function confirmTransaction(
  userId: string,
  sourceText: string,
  args: Record<string, unknown>,
): Promise<AssistantReply> {
  const corrected = await applyCorrectionRules(userId, sourceText, args);
  const pending = await savePending(userId, {
    tool: 'createTransaction',
    args: corrected,
    sourceText,
    preview: previewOf('createTransaction', corrected),
  });

  return { kind: 'confirm', pending };
}

/** Ringkasan yang dibaca user sebelum menekan ✅ — harus cukup untuk menilai benar/salah. */
export function previewOf(tool: string, args: Record<string, unknown>): string {
  const value = (key: string): string | undefined => {
    const raw = args[key];
    return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
  };

  switch (tool) {
    case 'createTransaction': {
      const amount = typeof args.amount === 'number' ? formatRupiah(args.amount) : '?';
      const arah = args.type === 'income' ? 'Pemasukan' : 'Pengeluaran';
      return [
        `${arah}: ${amount}`,
        `Kategori: ${value('category') ?? '(tanpa kategori)'}`,
        value('account') ? `Akun: ${value('account')}` : null,
        value('note') ? `Catatan: ${value('note')}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    }

    case 'createTask':
      return [
        `Task: ${value('title') ?? '?'}`,
        `Prioritas: ${value('priority') ?? 'medium'}`,
        value('category') ? `Kategori: ${value('category')}` : null,
        value('deadline') ? `Deadline: ${value('deadline')}` : null,
      ]
        .filter(Boolean)
        .join('\n');

    case 'createEvent':
      return [
        `Event: ${value('title') ?? '?'}`,
        `Mulai: ${value('startAt') ?? '?'}`,
        value('location') ? `Lokasi: ${value('location')}` : null,
      ]
        .filter(Boolean)
        .join('\n');

    case 'logSession':
      return [
        `Sesi: ${args.durationMinutes ?? '?'} menit`,
        `Kategori: ${value('category') ?? '(tanpa kategori)'}`,
      ].join('\n');

    default:
      return JSON.stringify(args);
  }
}

export async function confirmPending(userId: string, pendingId: string) {
  const pending = await takePending(userId, pendingId);
  const result = await executeTool(userId, pending.tool, pending.args);
  return { tool: pending.tool, ...result };
}
