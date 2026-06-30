// hooks/useToast.ts
import { create } from 'zustand';
import { ToastVariant, ToastItem } from '../components/ui/ToastContainer';

interface ToastStore {
  toasts: ToastItem[];
  showToast: (
    message: string,
    variant?: ToastVariant,
    actionLabel?: string,
    onAction?: () => void,
  ) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  showToast: (message, variant = 'success', actionLabel?, onAction?) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    set((state) => ({
      toasts: [...state.toasts, { id, message, variant, actionLabel, onAction }],
    }));
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },
}));
