import { create } from 'zustand';

interface DragDropState {
  targetDirectoryId: string | null;
  setTargetDirectoryId: (id: string | null) => void;
}

export const useDragDropStore = create<DragDropState>((set) => ({
  targetDirectoryId: null,
  setTargetDirectoryId: (id) => set({ targetDirectoryId: id }),
}));
