import { create } from 'zustand';
import { getRootDirectoryContents } from '../api/directories';

export type DirectorySection = 'personal' | 'shared' | null;

interface DirectoryState {
  personalStorageId: string;
  musicDirectoryId?: string;
  isLoading: boolean;
  // В каком разделе находится открытая директория: личное хранилище или общая.
  // Определить это по URL нельзя (обе — /directories/<id>), поэтому значение
  // выставляет DirectoryPage, а боковое меню использует его для подсветки.
  currentSection: DirectorySection;
  setCurrentSection: (section: DirectorySection) => void;
  fetchPersonalStorageId: (accessToken: string) => Promise<void>;
  reset: () => void; // Добавляем метод сброса
}

export const useDirectoryStore = create<DirectoryState>((set) => ({
  personalStorageId: 'personal',
  isLoading: true,
  currentSection: null,

  setCurrentSection: (section) => set({ currentSection: section }),

  fetchPersonalStorageId: async (accessToken: string) => {
    try {
      const contents = await getRootDirectoryContents(accessToken);
      const rootId = contents.id;
      localStorage.setItem('rootDirectoryId', rootId);
      set({
        personalStorageId: rootId,
        musicDirectoryId: contents.subdirectories.find((directory) => directory.is_music_root)?.id,
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to get root directory:', error);
      localStorage.removeItem('rootDirectoryId');
      set({ personalStorageId: 'personal', musicDirectoryId: undefined, isLoading: false });
    }
  },

  reset: () => {
    set({ personalStorageId: 'personal', musicDirectoryId: undefined, isLoading: true });
    localStorage.removeItem('rootDirectoryId');
  },
}));
