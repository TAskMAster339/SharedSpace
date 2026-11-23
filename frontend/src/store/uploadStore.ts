import { create } from 'zustand';

export type UploadTaskStatus = 'pending' | 'uploading' | 'success' | 'error';

export interface UploadTask {
  id: string;
  file: File;
  targetDirId: string;
  status: UploadTaskStatus;
  progress: number;
  error?: string;
  toFavorites: boolean;
  toastId?: string;
}

interface UploadState {
  tasks: Record<string, UploadTask>;
  order: string[];
  isModalOpen: boolean;
  isMinimized: boolean;

  addTasks: (files: File[], targetDirId: string, opts?: { toFavorites?: boolean }) => string[];
  updateTask: (id: string, patch: Partial<Omit<UploadTask, 'id'>>) => void;
  removeTask: (id: string) => void;
  retryFailed: () => void;
  clearCompleted: () => void;
  openModal: () => void;
  closeModal: () => void;
  minimize: () => void;
  expand: () => void;
}

export const useUploadStore = create<UploadState>((set, get) => ({
  tasks: {},
  order: [],
  isModalOpen: false,
  isMinimized: false,

  addTasks: (files, targetDirId, opts) => {
    const ids: string[] = [];
    const toFavorites = opts?.toFavorites ?? false;
    set((state) => {
      const tasks = { ...state.tasks };
      const order = [...state.order];
      for (const file of files) {
        const id =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        tasks[id] = {
          id,
          file,
          targetDirId,
          status: 'pending',
          progress: 0,
          toFavorites,
        };
        order.push(id);
        ids.push(id);
      }
      return { tasks, order, isModalOpen: true, isMinimized: false };
    });
    return ids;
  },

  updateTask: (id, patch) => {
    set((state) => {
      const task = state.tasks[id];
      if (!task) return state;
      return { tasks: { ...state.tasks, [id]: { ...task, ...patch } } };
    });
  },

  removeTask: (id) => {
    set((state) => {
      if (!state.tasks[id]) return state;
      const tasks = { ...state.tasks };
      delete tasks[id];
      return { tasks, order: state.order.filter((x) => x !== id) };
    });
  },

  retryFailed: () => {
    set((state) => {
      const tasks = { ...state.tasks };
      let changed = false;
      for (const id of state.order) {
        const task = tasks[id];
        if (task && task.status === 'error') {
          tasks[id] = { ...task, status: 'pending', progress: 0, error: undefined };
          changed = true;
        }
      }
      return changed ? { tasks } : state;
    });
  },

  clearCompleted: () => {
    set((state) => {
      const tasks: Record<string, UploadTask> = {};
      const order: string[] = [];
      for (const id of state.order) {
        const task = state.tasks[id];
        if (task && (task.status === 'pending' || task.status === 'uploading' || task.status === 'error')) {
          tasks[id] = task;
          order.push(id);
        }
      }
      return { tasks, order };
    });
  },

  openModal: () => set({ isModalOpen: true, isMinimized: false }),
  closeModal: () => set({ isModalOpen: false }),
  minimize: () => set({ isMinimized: true, isModalOpen: false }),
  expand: () => set({ isModalOpen: true, isMinimized: false }),
}));

export const selectActiveCount = (s: UploadState) =>
  s.order.filter((id) => s.tasks[id]?.status === 'pending' || s.tasks[id]?.status === 'uploading')
    .length;

export const selectErrorCount = (s: UploadState) =>
  s.order.filter((id) => s.tasks[id]?.status === 'error').length;

export const selectSuccessCount = (s: UploadState) =>
  s.order.filter((id) => s.tasks[id]?.status === 'success').length;
