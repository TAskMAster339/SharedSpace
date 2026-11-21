import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { convertAndSave, convertAndDownload } from '../api/files';
import { normalizeFormat } from '../constants/convertFormats';
import { ApiError } from '../api/client';
import { useToastStore } from './useToast';

interface UseFileConversionReturn {
  isConverting: boolean;
  conversionProgress: number;
  error: string | null;
  convertAndDownload: (fileId: string, format: string, filename: string) => Promise<void>;
  convertAndSave: (fileId: string, format: string, filename: string) => Promise<string | null>;
}

const SIM_MAX = 70;

function simulateProgress(callback: (pct: number) => void): () => void {
  const startTime = Date.now();
  const id = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const pct = Math.min(SIM_MAX, Math.round(SIM_MAX * (1 - Math.exp(-elapsed / 6000))));
    callback(pct);
  }, 500);
  return () => clearInterval(id);
}

export function useFileConversion(): UseFileConversionReturn {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const showToast = useToastStore((state) => state.showToast);
  const stopSimRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => stopSimRef.current?.();
  }, []);

  const startSimulation = useCallback(() => {
    stopSimRef.current?.();
    stopSimRef.current = simulateProgress(setConversionProgress);
  }, []);

  const stopSimulation = useCallback(() => {
    stopSimRef.current?.();
    stopSimRef.current = null;
  }, []);

  const handleConvertAndDownload = useCallback(
    async (fileId: string, format: string, filename: string): Promise<void> => {
      if (!accessToken) {
        setError('Не авторизован');
        showToast('Не авторизован', 'error');
        return;
      }

      setIsConverting(true);
      setConversionProgress(0);
      setError(null);
      startSimulation();

      try {
        const normalizedFormat = normalizeFormat(format);
        const result = await convertAndDownload(accessToken, fileId, normalizedFormat);

        setConversionProgress(100);
        const link = document.createElement('a');
        link.href = result.download_url;
        link.download = result.filename;
        document.body.appendChild(link);
        link.click();
        link.remove();

        showToast(`Файл «${filename}» сконвертирован. Скачивание началось`, 'success');
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Ошибка конвертации';
        setError(message);
        showToast(`Ошибка конвертации: ${message}`, 'error');
        throw err;
      } finally {
        stopSimulation();
        setIsConverting(false);
      }
    },
    [accessToken, showToast, startSimulation, stopSimulation],
  );

  const handleConvertAndSave = useCallback(
    async (fileId: string, format: string, filename: string): Promise<string | null> => {
      if (!accessToken) {
        setError('Не авторизован');
        showToast('Не авторизован', 'error');
        return null;
      }

      setIsConverting(true);
      setConversionProgress(0);
      setError(null);
      startSimulation();

      try {
        const normalizedFormat = normalizeFormat(format);
        const result = await convertAndSave(accessToken, fileId, normalizedFormat);

        setConversionProgress(100);
        const ext = format.toLowerCase();
        showToast(`Файл «${filename}» сконвертирован в ${ext.toUpperCase()} и сохранён`, 'success');
        return result.result_file_id;
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Ошибка конвертации';
        setError(message);
        showToast(`Ошибка конвертации: ${message}`, 'error');
        throw err;
      } finally {
        stopSimulation();
        setIsConverting(false);
      }
    },
    [accessToken, showToast, startSimulation, stopSimulation],
  );

  return {
    isConverting,
    conversionProgress,
    error,
    convertAndDownload: handleConvertAndDownload,
    convertAndSave: handleConvertAndSave,
  };
}
