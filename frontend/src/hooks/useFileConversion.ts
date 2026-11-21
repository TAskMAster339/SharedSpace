import { useEffect } from 'react';
import { ApiError } from '../api/client';
import { convertAndDownload, convertAndSave, type ConversionResponse } from '../api/files';
import { normalizeFormat } from '../constants/convertFormats';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from './useToast';

const listeners = new Set<(result: ConversionResponse) => void>();

export function useOnFileConverted(
  listener: (result: ConversionResponse, signal: AbortSignal) => void,
) {
  useEffect(() => {
    const controller = new AbortController();
    const notify = (result: ConversionResponse) => listener(result, controller.signal);
    listeners.add(notify);
    return () => {
      controller.abort();
      listeners.delete(notify);
    };
  }, [listener]);
}

export async function startFileConversion(
  fileId: string,
  filename: string,
  format: string,
  action: 'download' | 'save',
) {
  const { accessToken, user } = useAuthStore.getState();
  const { showToast, removeToast } = useToastStore.getState();
  if (!accessToken || !user) {
    showToast('Не авторизован', 'error');
    return;
  }

  let toastId: string | undefined;
  const sameUser = () => useAuthStore.getState().user?.id === user.id;
  const controller = new AbortController();
  const unsubscribe = useAuthStore.subscribe(() => {
    if (!sameUser()) controller.abort();
  });
  const onAccepted = () => {
    if (sameUser()) {
      toastId = showToast(
        `Файл «${filename}» в очереди на конвертацию. Он будет обработан, как только освободится место.`,
        'pending',
      );
    }
  };

  try {
    const target = normalizeFormat(format);
    const options = { onAccepted, signal: controller.signal };
    if (action === 'save') {
      const result = await convertAndSave(accessToken, fileId, target, options);
      if (!sameUser()) return;
      listeners.forEach((listener) => listener(result));
      void useAuthStore.getState().refreshUser();
    } else {
      const result = await convertAndDownload(accessToken, fileId, target, options);
      if (!sameUser()) return;
      const link = document.createElement('a');
      link.href = result.download_url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  } catch (error) {
    if (sameUser()) {
      const message = error instanceof ApiError ? error.message : 'Не удалось конвертировать файл';
      showToast(message, 'error');
    }
  } finally {
    unsubscribe();
    if (toastId) removeToast(toastId);
  }
}
