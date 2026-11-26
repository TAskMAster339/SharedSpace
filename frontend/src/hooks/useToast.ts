import { create } from 'zustand';
import { ToastVariant, ToastItem } from '../components/ui/ToastContainer';

interface ToastStore {
  toasts: ToastItem[];
  showToast: (
    message: string,
    variant?: ToastVariant,
    actionLabel?: string,
    onAction?: () => void,
  ) => string;
  updateToast: (id: string, patch: Partial<Omit<ToastItem, 'id'>>) => void;
  removeToast: (id: string) => void;
  toastDesktopBottomPx: number;
  toastDesktopTopOffsetPx: number;
  setToastDesktopTopOffsetPx: (px: number) => void;
  setToastDesktopBottomPx: (px: number) => void;
  toastMobileBottomPx: number;
  setToastMobileBottomPx: (px: number) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  showToast: (message, variant = 'success', actionLabel?, onAction?) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    set((state) => ({
      toasts: [...state.toasts, { id, message, variant, actionLabel, onAction }],
    }));
    return id;
  },
  updateToast: (id, patch) => {
    set((state) => ({
      toasts: state.toasts.map((toast) => (toast.id === id ? { ...toast, ...patch } : toast)),
    }));
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },
  toastDesktopBottomPx: 16,
  toastDesktopTopOffsetPx: 0,
  setToastDesktopTopOffsetPx: (px) =>
    set((state) =>
      state.toastDesktopTopOffsetPx === px ? state : { toastDesktopTopOffsetPx: px },
    ),
  setToastDesktopBottomPx: (px) =>
    set((state) => (state.toastDesktopBottomPx === px ? state : { toastDesktopBottomPx: px })),
  toastMobileBottomPx: 80,
  setToastMobileBottomPx: (px) => set({ toastMobileBottomPx: px }),
}));
