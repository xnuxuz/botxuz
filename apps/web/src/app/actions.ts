'use server';

import { API_PREFIX, type ApiResponse } from '@xnuxuz/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '../lib/server-api';
import { API_BASE, clearTokens, readTokens, saveTokens, type Tokens } from '../lib/session';

/**
 * Server action, bukan route handler: form bekerja tanpa JavaScript, dan token
 * tidak pernah melewati bundle browser sama sekali.
 */

export type FormState = { error: string | null };

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  const response = await fetch(`${API_BASE}${API_PREFIX}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });

  const payload = (await response.json()) as ApiResponse<{ tokens: Tokens }>;
  if (!payload.ok) return { error: payload.error.message };

  await saveTokens(payload.data.tokens);
  redirect('/');
}

export async function logout(): Promise<void> {
  const { access } = await readTokens();

  // Sesi dicabut di server juga, bukan sekadar cookie dibuang — kalau tidak,
  // refresh token yang sempat bocor tetap hidup sampai 30 hari.
  if (access) {
    await fetch(`${API_BASE}${API_PREFIX}/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${access}` },
      cache: 'no-store',
    }).catch(() => undefined);
  }

  await clearTokens();
  redirect('/login');
}

export async function completeTask(taskId: string): Promise<void> {
  await apiFetch(`/tasks/${taskId}/complete`, { method: 'POST' });
  revalidatePath('/');
  revalidatePath('/tasks');
}

export async function createTask(_prev: FormState, formData: FormData): Promise<FormState> {
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { error: 'Judul tidak boleh kosong' };

  const deadline = String(formData.get('deadline') ?? '');

  try {
    await apiFetch('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title,
        priority: String(formData.get('priority') ?? 'medium'),
        // input[type=datetime-local] mengirim waktu lokal browser tanpa zona;
        // Date() menafsirkannya di zona server, lalu dikirim sebagai UTC.
        deadline: deadline ? new Date(deadline).toISOString() : null,
      }),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Gagal membuat task' };
  }

  revalidatePath('/tasks');
  return { error: null };
}

export async function createTransaction(_prev: FormState, formData: FormData): Promise<FormState> {
  const amount = Number(formData.get('amountInt'));
  if (!Number.isInteger(amount) || amount <= 0) {
    return { error: 'Nominal harus bilangan bulat lebih dari 0' };
  }

  const categoryId = String(formData.get('categoryId') ?? '');

  try {
    await apiFetch('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        accountId: String(formData.get('accountId') ?? ''),
        type: String(formData.get('type') ?? 'expense'),
        amountInt: amount,
        categoryId: categoryId || null,
        note: String(formData.get('note') ?? '') || null,
      }),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Gagal mencatat transaksi' };
  }

  revalidatePath('/finance');
  revalidatePath('/');
  return { error: null };
}

export async function deleteTransaction(id: string): Promise<void> {
  await apiFetch(`/transactions/${id}`, { method: 'DELETE' });
  revalidatePath('/finance');
  revalidatePath('/');
}

export async function askAssistant(_prev: FormState, formData: FormData): Promise<FormState> {
  const text = String(formData.get('text') ?? '').trim();
  if (!text) return { error: null };

  try {
    const reply = await apiFetch<{ kind: string; pending?: { id: string } }>('/ai/message', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });

    // Aksi write dari asisten butuh konfirmasi (§3.5); di web konfirmasinya
    // langsung di halaman yang sama.
    if (reply.kind === 'confirm' && reply.pending) {
      await apiFetch(`/ai/confirm/${reply.pending.id}`, { method: 'POST' });
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Gagal memproses' };
  }

  revalidatePath('/finance');
  revalidatePath('/');
  return { error: null };
}

export async function issueTelegramCode(): Promise<{ code: string; ttlSec: number }> {
  return apiFetch<{ code: string; ttlSec: number }>('/auth/telegram/code', { method: 'POST' });
}
