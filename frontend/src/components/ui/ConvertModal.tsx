import React, { useState, useRef, useEffect } from 'react';
import { X, AlertCircle, Download, Save, ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from './Button';
import { getFileTypeDisplay } from '../../utils/fileType';
import { getAvailableConvertFormats, isConvertSupported } from '../../constants/convertFormats';

interface ConvertModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
  mimeType: string;
  extension: string;
  onConvertAndDownload: (format: string) => Promise<void>;
  onConvertAndSave: (format: string) => Promise<string | null>;
  isConverting?: boolean;
}

export const ConvertModal: React.FC<ConvertModalProps> = ({
  isOpen,
  onClose,
  fileId,
  fileName,
  mimeType,
  extension,
  onConvertAndDownload,
  onConvertAndSave,
  isConverting = false,
}) => {
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'download' | 'save'>('download');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleDropdown = () => {
    if (isDropdownOpen) {
      setIsDropdownOpen(false);
      return;
    }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
      setIsDropdownOpen(true);
    }
  };

  if (!isOpen) return null;

  const availableFormats = getAvailableConvertFormats(mimeType, extension);
  const isSupported = isConvertSupported(mimeType, extension);
  const fileTypeDisplay = getFileTypeDisplay(mimeType, extension);

  const handleConvert = async () => {
    if (!selectedFormat) return;

    try {
      if (actionType === 'download') {
        await onConvertAndDownload(selectedFormat);
        onClose();
      } else {
        const resultFileId = await onConvertAndSave(selectedFormat);
        if (resultFileId) {
          onClose();
        }
      }
    } catch (err) {
      // Ошибка уже обработана в хуке
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
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <p className="text-sm text-theme-secondary">
              Файл: <span className="text-theme-primary font-medium">{fileName}</span>
            </p>
            <p className="text-sm text-theme-secondary mt-1">
              Тип: <span className="text-theme-primary font-medium">{fileTypeDisplay}</span>
            </p>
          </div>

          {isSupported ? (
            <>
              {/* Выбор формата */}
              <div ref={containerRef}>
                <p className="text-sm text-theme-secondary mb-2">Выберите формат:</p>
                <button
                  ref={triggerRef}
                  type="button"
                  onClick={toggleDropdown}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-theme-md text-sm border transition-colors',
                    'focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand',
                    isDropdownOpen
                      ? 'border-brand bg-theme-tertiary'
                      : 'border-theme bg-theme-tertiary hover:bg-theme-hover',
                  )}
                >
                  <span className={!selectedFormat ? 'text-theme-muted' : 'text-theme-primary'}>
                    {selectedFormat ? selectedFormat.toUpperCase() : '— выберите формат —'}
                  </span>
                  <ChevronDown
                    size={16}
                    className={cn(
                      'text-theme-muted transition-transform',
                      isDropdownOpen && 'rotate-180',
                    )}
                  />
                </button>
                {isDropdownOpen && dropdownStyle && (
                  <div
                    style={dropdownStyle}
                    className="bg-theme-secondary border border-theme rounded-theme-md shadow-theme-dropdown overflow-hidden max-h-48 overflow-y-auto"
                  >
                    {availableFormats.map((format) => (
                      <button
                        key={format}
                        type="button"
                        onClick={() => {
                          setSelectedFormat(format);
                          setIsDropdownOpen(false);
                        }}
                        className={cn(
                          'w-full text-left px-3 py-2 text-sm transition-colors',
                          selectedFormat === format
                            ? 'bg-brand text-theme-on-brand'
                            : 'text-theme-secondary hover:bg-theme-hover hover:text-theme-primary',
                        )}
                      >
                        {format.toUpperCase()}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Выбор действия */}
              <div>
                <p className="text-sm text-theme-secondary mb-2">Выберите действие:</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setActionType('download')}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-theme-md text-sm font-medium transition-colors border',
                      actionType === 'download'
                        ? 'bg-brand-light border-brand text-brand'
                        : 'bg-theme-tertiary border-theme text-theme-secondary hover:bg-theme-hover',
                    )}
                  >
                    <Download size={16} />
                    Скачать
                  </button>
                  <button
                    onClick={() => setActionType('save')}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-theme-md text-sm font-medium transition-colors border',
                      actionType === 'save'
                        ? 'bg-brand-light border-brand text-brand'
                        : 'bg-theme-tertiary border-theme text-theme-secondary hover:bg-theme-hover',
                    )}
                  >
                    <Save size={16} />
                    Сохранить
                  </button>
                </div>
                {actionType === 'save' && (
                  <p className="text-xs text-theme-muted mt-2 flex items-center gap-1">
                    <Save size={12} />
                    Файл будет сохранён в ту же директорию
                  </p>
                )}
                {actionType === 'download' && (
                  <p className="text-xs text-theme-muted mt-2 flex items-center gap-1">
                    <Download size={12} />
                    Файл будет скачан без сохранения в облаке
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <AlertCircle size={48} className="text-theme-muted mx-auto mb-4" />
              <p className="text-theme-secondary font-medium">Конвертация не поддерживается</p>
              <p className="text-sm text-theme-muted mt-1">
                Для файлов типа <span className="font-medium">{fileTypeDisplay}</span> конвертация
                пока недоступна
              </p>
              <p className="text-xs text-theme-muted mt-2">
                Доступные форматы: изображения (PNG, JPG, WEBP, GIF, BMP, TIFF), видео (MP4, WebM, AVI, MOV, MKV), аудио (MP3, WAV, FLAC, OGG, AAC)
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
                : actionType === 'download'
                  ? `Скачать ${selectedFormat?.toUpperCase() || ''}`
                  : `Сохранить как ${selectedFormat?.toUpperCase() || ''}`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
