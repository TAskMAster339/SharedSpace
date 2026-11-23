import { NonRetryableUploadError, uploadSingleFile } from '../api/files';
import { addFavorite } from '../api/favorites';
import { useAuthStore } from '../store/authStore';
import { useUploadStore } from '../store/uploadStore';
import { useToastStore } from '../hooks/useToast';
import { useDragDropStore } from '../store/dragDropStore';
import { useFavoritesStore } from '../store/favoritesStore';
import { buildSingleFileSuccessMessage, buildSingleFileErrorMessage } from '../utils/uploadMessage';

const CONCURRENCY = 3;
const REFRESH_DEBOUNCE_MS = 400;

const controllers = new Map<string, AbortController>();
let started = false;
let unsubAuth: (() => void) | null = null;
let unsubUploads: (() => void) | null = null;
let refreshTimer: number | undefined;
let lastUserId: string | null = null;

function pickNextPendingId(): string | null {
  const { order, tasks } = useUploadStore.getState();
  for (const id of order) {
    const task = tasks[id];
    if (task && task.status === 'pending') return id;
  }
  return null;
}

function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = window.setTimeout(() => {
    refreshTimer = undefined;
    useDragDropStore.getState().triggerUploadComplete();
  }, REFRESH_DEBOUNCE_MS);
}

function resetUploads() {
  if (refreshTimer !== undefined) {
    window.clearTimeout(refreshTimer);
    refreshTimer = undefined;
  }

  const active = [...controllers.values()];
  controllers.clear();
  for (const controller of active) controller.abort();

  const { tasks, reset } = useUploadStore.getState();
  const { removeToast } = useToastStore.getState();
  for (const task of Object.values(tasks)) {
    if (task.toastId) removeToast(task.toastId);
  }
  reset();
}

async function runOne(taskId: string, accessToken: string) {
  const store = useUploadStore.getState();
  const task = store.tasks[taskId];
  const controller = new AbortController();
  controllers.set(taskId, controller);
  store.updateTask(taskId, { status: 'uploading', progress: 0, error: undefined });

  try {
    const result = await uploadSingleFile(
      accessToken,
      task.targetDirId,
      task.file,
      (progress) => {
        if (!controller.signal.aborted) useUploadStore.getState().updateTask(taskId, { progress });
      },
      controller.signal,
    );

    if (controller.signal.aborted) return;

    let addedToFavorites = false;
    if (task.toFavorites) {
      try {
        await addFavorite(
          useAuthStore.getState().accessToken ?? accessToken,
          result.id,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        useFavoritesStore.getState().addFavoriteId(result.id);
        addedToFavorites = true;
      } catch (err) {
        if (!controller.signal.aborted) console.warn('Не удалось добавить в избранное:', err);
      }
    }

    if (controller.signal.aborted) return;
    const toastId = useToastStore
      .getState()
      .showToast(buildSingleFileSuccessMessage(task.file.name, addedToFavorites), 'success');
    useUploadStore.getState().updateTask(taskId, { status: 'success', progress: 100, toastId });
    scheduleRefresh();
  } catch (err) {
    if (controller.signal.aborted) return;
    const reason = err instanceof Error ? err.message : undefined;
    const toastId = useToastStore
      .getState()
      .showToast(buildSingleFileErrorMessage(task.file.name, reason), 'error');
    useUploadStore.getState().updateTask(taskId, {
      status: 'error',
      error: reason || 'Не удалось загрузить файл',
      progress: 0,
      retryable: !(err instanceof NonRetryableUploadError),
      toastId,
    });
  } finally {
    if (controllers.get(taskId) === controller) {
      controllers.delete(taskId);
      pump();
    }
  }
}

function pump() {
  const { accessToken, user } = useAuthStore.getState();
  if (!started || !accessToken || !user) return;

  while (controllers.size < CONCURRENCY) {
    const nextId = pickNextPendingId();
    if (!nextId) break;
    void runOne(nextId, accessToken);
  }
}

export function startUploadManager() {
  if (started) return;
  started = true;
  lastUserId = useAuthStore.getState().user?.id ?? null;

  unsubUploads = useUploadStore.subscribe((state, prev) => {
    if (state.enqueueVersion !== prev.enqueueVersion) pump();
  });

  unsubAuth = useAuthStore.subscribe((state) => {
    const userId = state.user?.id ?? null;
    if (userId !== lastUserId) {
      lastUserId = userId;
      resetUploads();
    }
    pump();
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
  resetUploads();
}
