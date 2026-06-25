import { create } from 'zustand';

interface DragDropState {
  targetDirectoryId: string | null;
  onUploadComplete?: (() => void) | null;
  setTargetDirectoryId: (id: string | null) => void;
  setOnUploadComplete: (callback: (() => void) | null) => void;
  triggerUploadComplete: () => void;
}

export const useDragDropStore = create<DragDropState>((set, get) => ({
  targetDirectoryId: null,
  onUploadComplete: null,
  setTargetDirectoryId: (id) => set({ targetDirectoryId: id }),
  setOnUploadComplete: (callback) => set({ onUploadComplete: callback }),
  triggerUploadComplete: () => {
    const { onUploadComplete } = get();
    if (onUploadComplete) {
      onUploadComplete();
    }
  },
}));
