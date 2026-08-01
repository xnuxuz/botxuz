import { redirect } from 'next/navigation';
import { NewTaskForm } from '../../components/new-task-form';
import { Shell } from '../../components/shell';
import { TaskRow } from '../../components/task-row';
import { apiFetch, apiFetchSafe, SessionExpiredError } from '../../lib/server-api';
import type { Task, User } from '../../lib/types';

export const dynamic = 'force-dynamic';

const GROUPS = [
  { status: 'todo', label: 'Belum dikerjakan' },
  { status: 'in_progress', label: 'Sedang dikerjakan' },
  { status: 'done', label: 'Selesai' },
] as const;

export default async function TasksPage() {
  let user: User;
  try {
    user = await apiFetch<User>('/auth/me');
  } catch (error) {
    if (error instanceof SessionExpiredError) redirect('/login');
    throw error;
  }

  const groups = await Promise.all(
    GROUPS.map((group) =>
      apiFetchSafe<Task[]>(`/tasks?status=${group.status}&limit=50`, []).then((tasks) => ({
        ...group,
        tasks,
      })),
    ),
  );

  return (
    <Shell>
      <section className="card">
        <h2>Task baru</h2>
        <NewTaskForm />
      </section>

      <div className="grid" style={{ marginTop: '1rem' }}>
        {groups.map((group) => (
          <section className="card" key={group.status}>
            <h2>
              {group.label} ({group.tasks.length})
            </h2>
            {group.tasks.length === 0 ? (
              <p className="empty">Kosong.</p>
            ) : (
              <ul className="list">
                {group.tasks.map((task) =>
                  group.status === 'done' ? (
                    <li key={task.id}>
                      <span className="grow" style={{ color: 'var(--muted)' }}>
                        {task.title}
                      </span>
                    </li>
                  ) : (
                    <TaskRow key={task.id} task={task} timezone={user.timezone} />
                  ),
                )}
              </ul>
            )}
          </section>
        ))}
      </div>
    </Shell>
  );
}
