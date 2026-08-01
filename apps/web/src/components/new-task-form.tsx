'use client';

import { useActionState, useRef } from 'react';
import { createTask, type FormState } from '../app/actions';

const INITIAL: FormState = { error: null };

export function NewTaskForm() {
  const [state, action, pending] = useActionState(createTask, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await action(formData);
        formRef.current?.reset();
      }}
      className="stack"
    >
      <input name="title" placeholder="Judul task" required aria-label="Judul task" />

      <div className="row">
        <select name="priority" defaultValue="medium" aria-label="Prioritas">
          <option value="low">Rendah</option>
          <option value="medium">Sedang</option>
          <option value="high">Tinggi</option>
          <option value="urgent">Mendesak</option>
        </select>

        <input name="deadline" type="datetime-local" aria-label="Deadline" />

        <button type="submit" className="primary" disabled={pending}>
          {pending ? '…' : 'Tambah'}
        </button>
      </div>

      {state.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
