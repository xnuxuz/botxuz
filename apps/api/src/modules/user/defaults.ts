import { CategoryDomain } from '@xnuxuz/db';
import { DEFAULT_NOTIF_CHANNELS, NOTIF_TYPES } from '@xnuxuz/shared';
import { db } from '../../db.js';

/**
 * Kategori awal supaya user tidak menghadapi dropdown kosong di menit pertama.
 * Semuanya boleh dihapus/diubah — ini seed, bukan kategori sistem.
 */
const DEFAULT_CATEGORIES: { domain: CategoryDomain; name: string; color: string }[] = [
  { domain: CategoryDomain.task, name: 'Kuliah', color: '#3b82f6' },
  { domain: CategoryDomain.task, name: 'Organisasi', color: '#a855f7' },
  { domain: CategoryDomain.task, name: 'Kerja', color: '#f97316' },
  { domain: CategoryDomain.task, name: 'Side Project', color: '#14b8a6' },
  { domain: CategoryDomain.task, name: 'Pribadi', color: '#64748b' },

  { domain: CategoryDomain.event, name: 'Kuliah', color: '#3b82f6' },
  { domain: CategoryDomain.event, name: 'Rapat', color: '#a855f7' },
  { domain: CategoryDomain.event, name: 'Pribadi', color: '#64748b' },

  { domain: CategoryDomain.finance, name: 'Makan', color: '#ef4444' },
  { domain: CategoryDomain.finance, name: 'Transport', color: '#f59e0b' },
  { domain: CategoryDomain.finance, name: 'Kos & Tagihan', color: '#8b5cf6' },
  { domain: CategoryDomain.finance, name: 'Langganan', color: '#06b6d4' },
  { domain: CategoryDomain.finance, name: 'Belanja', color: '#ec4899' },
  { domain: CategoryDomain.finance, name: 'Pemasukan', color: '#22c55e' },
  { domain: CategoryDomain.finance, name: 'Lainnya', color: '#64748b' },
];

/**
 * Dipanggil sekali saat register. `skipDuplicates` membuatnya aman diulang,
 * misalnya kalau nanti dipakai ulang oleh perintah maintenance.
 */
export async function seedDefaultsForUser(userId: string): Promise<void> {
  await db.$transaction([
    db.category.createMany({
      data: DEFAULT_CATEGORIES.map((category) => ({ ...category, userId })),
      skipDuplicates: true,
    }),
    db.notificationPreference.createMany({
      data: Object.values(NOTIF_TYPES).map((notifType) => ({
        userId,
        notifType,
        channelsJson: DEFAULT_NOTIF_CHANNELS[notifType],
      })),
      skipDuplicates: true,
    }),
    // Satu account tunai supaya transaksi pertama tidak perlu setup dulu.
    db.account.createMany({
      data: [{ userId, name: 'Tunai', type: 'cash' }],
      skipDuplicates: true,
    }),
  ]);
}
