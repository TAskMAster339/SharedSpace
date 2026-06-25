// hooks/useToast.ts
import { create } from 'zustand';
import { ToastVariant, ToastItem } from '../components/ui/ToastContainer';

interface ToastStore {
  toasts: ToastItem[];
  showToast: (message: string, variant?: ToastVariant) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  showToast: (message, variant = 'success') => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    set((state) => ({
      toasts: [...state.toasts, { id, message, variant }]
    }));
    // Автоматически удаляем через 3 секунды
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id)
      }));
    }, 3000);
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id)
    }));
  },
}));