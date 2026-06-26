import React, { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from './Button';

// Константа с поддерживаемыми форматами конвертации
export const ALLOWED_CONVERT_FORMATS: Record<string, string[]> = {
  'image/png': ['jpg', 'jpeg', 'webp'],
  'image/jpeg': ['png', 'webp'],
  'image/jpg': ['png', 'webp'],
  'image/webp': ['png', 'jpg', 'jpeg'],
  'image/gif': ['png', 'webp'],
  'image/svg+xml': ['png', 'jpg'],
  'image/bmp': ['png', 'jpg', 'webp'],
  'image/tiff': ['png', 'jpg'],
  'image/tif': ['png', 'jpg'],
};

// Также поддерживаем по расширению
export const ALLOWED_CONVERT_BY_EXTENSION: Record<string, string[]> = {
  png: ['jpg', 'jpeg', 'webp'],
  jpg: ['png', 'webp'],
  jpeg: ['png', 'webp'],
  webp: ['png', 'jpg', 'jpeg'],
  gif: ['png', 'webp'],
  svg: ['png', 'jpg'],
  bmp: ['png', 'jpg', 'webp'],
  tiff: ['png', 'jpg'],
  tif: ['png', 'jpg'],
};

interface ConvertModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
  mimeType: string;
  extension: string;
  onConvert: (format: string) => void;
  isConverting?: boolean;
}

export const ConvertModal: React.FC<ConvertModalProps> = ({
  isOpen,
  onClose,
  fileId,
  fileName,
  mimeType,
  extension,
  onConvert,
  isConverting = false,
}) => {
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);

  if (!isOpen) return null;

  // Определяем доступные форматы для конвертации
  const getAvailableFormats = (): string[] => {
    // Сначала пробуем по MIME-типу
    const formats = ALLOWED_CONVERT_FORMATS[mimeType] || [];
    if (formats.length > 0) return formats;

    // Потом по расширению
    const ext = extension.replace(/^\./, '').toLowerCase();
    const extFormats = ALLOWED_CONVERT_BY_EXTENSION[ext] || [];
    if (extFormats.length > 0) return extFormats;

    return [];
  };

  const availableFormats = getAvailableFormats();
  const isSupported = availableFormats.length > 0;

  const handleConvert = () => {
    if (selectedFormat) {
      onConvert(selectedFormat);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-theme-secondary rounded-theme-xl max-w-md w-full shadow-theme-dropdown border border-theme max-h-[90vh] flex flex-col">
        {/* Шапка */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-theme shrink-0">
          <h2 className="text-lg font-semibold text-theme-primary">Конвертация файла</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-theme-full hover:bg-theme-hover transition-colors"
          >
            <X size={20} className="text-theme-secondary" />
          </button>
        </div>

        {/* Тело */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4">
            <p className="text-sm text-theme-secondary">
              Файл: <span className="text-theme-primary font-medium">{fileName}</span>
            </p>
          </div>

          {isSupported ? (
            <>
              <p className="text-sm text-theme-secondary mb-4">Выберите формат для конвертации:</p>
              <div className="flex flex-wrap gap-2">
                {availableFormats.map((format) => (
                  <button
                    key={format}
                    onClick={() => setSelectedFormat(format)}
                    className={cn(
                      'px-4 py-2 rounded-theme-md text-sm font-medium transition-colors border',
                      selectedFormat === format
                        ? 'bg-brand text-theme-on-brand border-brand hover:bg-brand-hover'
                        : 'bg-theme-tertiary text-theme-secondary border-theme hover:bg-theme-hover',
                    )}
                  >
                    {format.toUpperCase()}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <AlertCircle size={48} className="text-theme-muted mx-auto mb-4" />
              <p className="text-theme-secondary font-medium">Конвертация не поддерживается</p>
              <p className="text-sm text-theme-muted mt-1">
                Для файлов формата <span className="font-medium">{extension || mimeType}</span>{' '}
                конвертация пока недоступна
              </p>
            </div>
          )}
        </div>

        {/* Футер */}
        <div className="flex gap-3 px-6 py-4 border-t border-theme shrink-0">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Отмена
          </Button>
          {isSupported && (
            <Button
              variant="primary"
              onClick={handleConvert}
              disabled={!selectedFormat || isConverting}
              className="flex-1"
            >
              {isConverting
                ? 'Конвертация...'
                : `Конвертировать в ${selectedFormat?.toUpperCase() || ''}`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
