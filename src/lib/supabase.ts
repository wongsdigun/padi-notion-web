// Data client for the Next.js route handlers in src/app/api/*.
// Historically this module talked to Supabase from the browser; it now calls the
// server routes, which own the Neon Postgres and Object Storage credentials.
import { Task, TaskAttachment } from './types';
import fallbackData from '@/data/initial-tasks.json';

export const isSupabaseConfigured = true;

let localTasksCache: Task[] = [...(fallbackData as Task[])];

let currentDbStatus: 'connected' | 'syncing' | 'offline' = 'syncing';

export function getDbStatus(): 'connected' | 'syncing' | 'offline' {
  return currentDbStatus;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body && !(init.body instanceof FormData)
      ? { 'Content-Type': 'application/json', ...init?.headers }
      : init?.headers,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} ${detail}`.trim());
  }
  return (await res.json()) as T;
}

export async function getTasks(): Promise<Task[]> {
  currentDbStatus = 'syncing';
  try {
    const data = await api<Task[]>('/api/tasks', { cache: 'no-store' });
    currentDbStatus = 'connected';
    localTasksCache = data;
    return data;
  } catch (err) {
    console.warn('Task fetch warning, using local cache:', (err as Error).message);
    currentDbStatus = 'offline';
    return localTasksCache;
  }
}

export async function upsertTask(task: Partial<Task> & { id: string }): Promise<Task> {
  currentDbStatus = 'syncing';
  try {
    const saved = await api<Task>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    });
    const idx = localTasksCache.findIndex((t) => t.id === saved.id);
    if (idx >= 0) localTasksCache[idx] = saved;
    else localTasksCache.unshift(saved);
    currentDbStatus = 'connected';
    return saved;
  } catch (err) {
    currentDbStatus = 'offline';
    throw err;
  }
}

export async function deleteTask(id: string): Promise<void> {
  currentDbStatus = 'syncing';
  try {
    await api<{ ok: true }>(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
    localTasksCache = localTasksCache.filter((t) => t.id !== id);
    currentDbStatus = 'connected';
  } catch (err) {
    currentDbStatus = 'offline';
    throw err;
  }
}

export async function uploadTaskFile(taskId: string, file: File): Promise<TaskAttachment> {
  const form = new FormData();
  form.append('file', file);
  form.append('taskId', taskId);
  return api<TaskAttachment>('/api/upload', { method: 'POST', body: form });
}
