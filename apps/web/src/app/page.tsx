import { API_PREFIX } from '@xnuxuz/shared';

export default function HomePage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem', lineHeight: 1.6 }}>
      <h1>xnuxuz — Personal Life OS</h1>
      <p>Fase 0: fondasi monorepo. Modul schedule, grinding, dan finance menyusul.</p>
      <p>
        API:{' '}
        <code>
          {process.env.NEXT_PUBLIC_API_URL}
          {API_PREFIX}
        </code>
      </p>
    </main>
  );
}
