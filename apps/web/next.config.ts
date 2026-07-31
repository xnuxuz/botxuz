import { fileURLToPath } from 'node:url';
import { loadRootEnv } from '@xnuxuz/shared';
import type { NextConfig } from 'next';

// Next hanya membaca .env di folder app-nya sendiri; repo ini punya satu .env
// di root workspace.
loadRootEnv();

const config: NextConfig = {
  reactStrictMode: true,
  // Standalone menghasilkan bundle minimal — image Docker jauh lebih kecil,
  // penting untuk VPS dengan RAM & disk terbatas.
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3011',
  },
};

export default config;
