import { create } from 'zustand';
import { getRootDirectoryContents } from '../api/directories';

export type DirectorySection = 'personal' | 'shared' | null;

interface DirectoryState {
  personalStorageId: string;
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
      // Проверяем localStorage
      const savedId = localStorage.getItem('rootDirectoryId');
      if (savedId) {
        // Проверяем, что ID валидный (не 'personal')
        if (savedId !== 'personal') {
          set({ personalStorageId: savedId, isLoading: false });
          return;
        }
      }

      // Запрашиваем через API
      const contents = await getRootDirectoryContents(accessToken);
      const rootId = contents.id;
      localStorage.setItem('rootDirectoryId', rootId);
      set({ personalStorageId: rootId, isLoading: false });
    } catch (error) {
      console.error('Failed to get root directory:', error);
      set({ personalStorageId: 'personal', isLoading: false });
    }
  },

  reset: () => {
    set({ personalStorageId: 'personal', isLoading: true });
    localStorage.removeItem('rootDirectoryId');
  },
}));
