import { completeTask } from '../app/actions';
import { shortDate } from '../lib/format';
import type { Task } from '../lib/types';

export function TaskRow({ task, timezone }: { task: Task; timezone: string }) {
  const overdue = task.deadline !== null && new Date(task.deadline) < new Date();

  return (
    <li>
      {/* Server action lewat form: menyelesaikan task tetap bisa tanpa JavaScript. */}
      <form action={completeTask.bind(null, task.id)}>
        <button type="submit" className="link" title="Tandai selesai" aria-label="Tandai selesai">
          ○
        </button>
      </form>

      <span className="grow">{task.title}</span>

      {task.priority !== 'low' ? (
        <span className={`badge ${task.priority}`}>{task.priority}</span>
      ) : null}

      {task.deadline ? (
        <span className="when" style={overdue ? { color: 'var(--danger)' } : undefined}>
          {shortDate(task.deadline, timezone)}
        </span>
      ) : null}
    </li>
  );
}
