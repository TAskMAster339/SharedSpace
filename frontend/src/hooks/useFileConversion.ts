import { useState, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { convertAndSave, convertAndDownload } from '../api/files';
import { normalizeFormat } from '../constants/convertFormats';
import { ApiError } from '../api/client';
import { useToastStore } from './useToast';

interface UseFileConversionReturn {
  isConverting: boolean;
  error: string | null;
  convertAndDownload: (fileId: string, format: string, filename: string) => Promise<void>;
  convertAndSave: (fileId: string, format: string, filename: string) => Promise<string | null>;
}

export function useFileConversion(): UseFileConversionReturn {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showToast = useToastStore((state) => state.showToast);
  
  const handleConvertAndDownload = useCallback(async (
    fileId: string,
    format: string,
    filename: string,
  ): Promise<void> => {
    if (!accessToken) {
      setError('Не авторизован');
      showToast('Не авторизован', 'error');
      return;
    }

    setIsConverting(true);
    setError(null);

    try {
      const normalizedFormat = normalizeFormat(format);
      const result = await convertAndDownload(accessToken, fileId, normalizedFormat);

      const response = await fetch(result.download_url);
      const blob = await response.blob();

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(link.href), 100);

      showToast(`Файл «${filename}» сконвертирован и скачан`, 'success');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Ошибка конвертации';
      setError(message);
      showToast(`Ошибка конвертации: ${message}`, 'error');
      throw err;
    } finally {
      setIsConverting(false);
    }
  }, [accessToken, showToast]);

  const handleConvertAndSave = useCallback(async (
    fileId: string,
    format: string,
    filename: string,
  ): Promise<string | null> => {
    if (!accessToken) {
      setError('Не авторизован');
      showToast('Не авторизован', 'error');
      return null;
    }

    setIsConverting(true);
    setError(null);

    try {
      const normalizedFormat = normalizeFormat(format);
      const result = await convertAndSave(accessToken, fileId, normalizedFormat);
      
      const ext = format.toLowerCase();
      showToast(`Файл «${filename}» сконвертирован в ${ext.toUpperCase()} и сохранён`, 'success');
      return result.result_file_id;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Ошибка конвертации';
      setError(message);
      showToast(`Ошибка конвертации: ${message}`, 'error');
      throw err;
    } finally {
      setIsConverting(false);
    }
  }, [accessToken, showToast]);

  return {
    isConverting,
    error,
    convertAndDownload: handleConvertAndDownload,
    convertAndSave: handleConvertAndSave,
  };
}
