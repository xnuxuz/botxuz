import { Router } from 'express';
import { authOf, requireAuth } from '../../http/auth.js';
import { pathParam } from '../../http/params.js';
import { createTaskSchema, listTaskSchema, updateTaskSchema } from './schemas.js';
import { completeTask, createTask, deleteTask, getTask, listTasks, updateTask } from './service.js';

export const taskRouter: Router = Router();

taskRouter.use(requireAuth);

taskRouter.get('/', async (req, res) => {
  const { userId } = authOf(req);
  const query = listTaskSchema.parse(req.query);
  const tasks = await listTasks(userId, query);

  res.json({
    ok: true,
    data: tasks,
    // Cursor keyset: id terakhir, bukan offset — halaman tetap konsisten
    // walau ada task baru masuk di tengah paginasi.
    meta: { nextCursor: tasks.length === query.limit ? tasks.at(-1)?.id : null },
  });
});

taskRouter.post('/', async (req, res) => {
  const { userId } = authOf(req);
  const task = await createTask(userId, createTaskSchema.parse(req.body));
  res.status(201).json({ ok: true, data: task });
});

taskRouter.get('/:id', async (req, res) => {
  const { userId } = authOf(req);
  res.json({ ok: true, data: await getTask(userId, pathParam(req, 'id')) });
});

taskRouter.patch('/:id', async (req, res) => {
  const { userId } = authOf(req);
  const task = await updateTask(userId, pathParam(req, 'id'), updateTaskSchema.parse(req.body));
  res.json({ ok: true, data: task });
});

taskRouter.post('/:id/complete', async (req, res) => {
  const { userId } = authOf(req);
  res.json({ ok: true, data: await completeTask(userId, pathParam(req, 'id')) });
});

taskRouter.delete('/:id', async (req, res) => {
  const { userId } = authOf(req);
  await deleteTask(userId, pathParam(req, 'id'));
  res.json({ ok: true, data: { deleted: true } });
});
