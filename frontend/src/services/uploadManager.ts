import { NonRetryableUploadError, uploadSingleFile } from '../api/files';
import { addFavorite } from '../api/favorites';
import { useAuthStore } from '../store/authStore';
import { useUploadStore } from '../store/uploadStore';
import { useToastStore } from '../hooks/useToast';
import { useDragDropStore } from '../store/dragDropStore';
import { useFavoritesStore } from '../store/favoritesStore';
import { buildSingleFileSuccessMessage, buildSingleFileErrorMessage } from '../utils/uploadMessage';

const CONCURRENCY = 3;
const PENDING_TOAST_LIMIT = 3;
const REFRESH_DEBOUNCE_MS = 400;

let running = 0;
const controllers = new Map<string, AbortController>();
let started = false;
let unsubAuth: (() => void) | null = null;
let unsubUploads: (() => void) | null = null;
let refreshTimer: number | undefined;
let lastUserId: string | null = null;

function acquireSlot(): boolean {
  if (running >= CONCURRENCY) return false;
  running += 1;
  return true;
}
function releaseSlot() {
  running = Math.max(0, running - 1);
}

function pickNextPendingId(): string | null {
  const { order, tasks } = useUploadStore.getState();
  for (const id of order) {
    const task = tasks[id];
    if (task && task.status === 'pending') return id;
  }
  return null;
}

function countPending(): number {
  const { order, tasks } = useUploadStore.getState();
  let n = 0;
  for (const id of order) {
    const t = tasks[id];
    if (t && (t.status === 'pending' || t.status === 'uploading')) n += 1;
  }
  return n;
}

function ensurePendingToasts() {
  const { tasks, order } = useUploadStore.getState();
  const pendingCount = countPending();
  if (pendingCount === 0 || pendingCount > PENDING_TOAST_LIMIT) return;

  const { showToast } = useToastStore.getState();
  for (const id of order) {
    const task = tasks[id];
    if (task && task.status === 'pending' && !task.toastId) {
      const toastId = showToast(`Загрузка «${task.file.name}»…`, 'pending');
      useUploadStore.getState().updateTask(id, { toastId });
    }
  }
}

function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = window.setTimeout(() => {
    refreshTimer = undefined;
    useDragDropStore.getState().triggerUploadComplete();
  }, REFRESH_DEBOUNCE_MS);
}

function abortAll() {
  for (const controller of controllers.values()) {
    try {
      controller.abort();
    } catch {
      /* noop */
    }
  }
  controllers.clear();
}

async function runOne(taskId: string) {
  const store = useUploadStore.getState();
  const task = store.tasks[taskId];
  if (!task || task.status !== 'pending') {
    releaseSlot();
    return;
  }

  const { accessToken, user } = useAuthStore.getState();
  if (!accessToken || !user) {
    store.updateTask(taskId, {
      status: 'error',
      error: 'Сеанс завершён',
      progress: 0,
      retryable: true,
    });
    releaseSlot();
    return;
  }

  const userId = user.id;
  const controller = new AbortController();
  controllers.set(taskId, controller);
  store.updateTask(taskId, { status: 'uploading', progress: 0, error: undefined });

  try {
    const result = await uploadSingleFile(
      accessToken,
      task.targetDirId,
      task.file,
      (progress) => {
        useUploadStore.getState().updateTask(taskId, { progress });
      },
      controller.signal,
    );

    const currentUser = useAuthStore.getState().user;
    if (!currentUser || currentUser.id !== userId) {
      useUploadStore.getState().updateTask(taskId, {
        status: 'error',
        error: 'Сеанс завершён',
      });
      return;
    }

    if (task.toFavorites) {
      try {
        await addFavorite(accessToken, result.id);
        useFavoritesStore.getState().addFavoriteId(result.id);
      } catch (err) {
        console.warn('Не удалось добавить в избранное:', err);
      }
    }

    useUploadStore.getState().updateTask(taskId, { status: 'success', progress: 100 });

    const { updateToast, showToast } = useToastStore.getState();
    const freshTask = useUploadStore.getState().tasks[taskId];
    if (freshTask?.toastId) {
      updateToast(freshTask.toastId, {
        message: buildSingleFileSuccessMessage(task.file.name, task.toFavorites),
        variant: 'success',
        actionLabel: undefined,
        onAction: undefined,
      });
    } else {
      showToast(buildSingleFileSuccessMessage(task.file.name, task.toFavorites), 'success');
    }

    scheduleRefresh();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      useUploadStore.getState().updateTask(taskId, {
        status: 'error',
        error: 'Загрузка отменена',
        retryable: true,
      });
      return;
    }
    const retryable = !(err instanceof NonRetryableUploadError);
    const reason = err instanceof Error ? err.message : undefined;
    useUploadStore.getState().updateTask(taskId, {
      status: 'error',
      error: reason || 'Не удалось загрузить файл',
      progress: 0,
      retryable,
    });

    const { updateToast, showToast } = useToastStore.getState();
    const freshTask = useUploadStore.getState().tasks[taskId];
    const message = buildSingleFileErrorMessage(task.file.name, reason);
    if (freshTask?.toastId) {
      updateToast(freshTask.toastId, {
        message,
        variant: 'error',
        actionLabel: undefined,
        onAction: undefined,
      });
    } else {
      showToast(message, 'error');
    }
  } finally {
    controllers.delete(taskId);
    releaseSlot();
    pump();
  }
}

function pump() {
  let dispatched = 0;
  while (running < CONCURRENCY) {
    const nextId = pickNextPendingId();
    if (!nextId) break;
    if (!acquireSlot()) break;
    dispatched += 1;
    void runOne(nextId);
  }
  ensurePendingToasts();
  if (dispatched === 0) return;
}
void pump;

function handleUserChange(nextUserId: string | null) {
  if (nextUserId === lastUserId) return;
  lastUserId = nextUserId;

  abortAll();

  const { tasks, order } = useUploadStore.getState();
  for (const id of order) {
    const task = tasks[id];
    if (task && (task.status === 'pending' || task.status === 'uploading')) {
      useUploadStore.getState().updateTask(id, {
        status: 'error',
        error: 'Сеанс завершён',
        progress: 0,
        retryable: true,
      });
    }
  }
}

export function startUploadManager() {
  if (started) return;
  started = true;
  lastUserId = useAuthStore.getState().user?.id ?? null;

  unsubUploads = useUploadStore.subscribe((state, prev) => {
    if (state.tasks !== prev.tasks) pump();
  });

  unsubAuth = useAuthStore.subscribe((state) => {
    handleUserChange(state.user?.id ?? null);
  });

  pump();
}

export function stopUploadManager() {
  if (!started) return;
  started = false;
  unsubAuth?.();
  unsubUploads?.();
  unsubAuth = null;
  unsubUploads = null;
  if (refreshTimer) {
    window.clearTimeout(refreshTimer);
    refreshTimer = undefined;
  }
  abortAll();
}
