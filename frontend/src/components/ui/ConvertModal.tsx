import React, { useEffect, useId, useState } from 'react';
import { AlertCircle, Download, Save } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';
import { getFileTypeDisplay } from '../../utils/fileType';
import { getAvailableConvertFormats, isConvertSupported } from '../../constants/convertFormats';
import { startFileConversion } from '../../hooks/useFileConversion';

interface ConvertModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
  mimeType: string;
  extension: string;
}

export const ConvertModal: React.FC<ConvertModalProps> = ({
  isOpen,
  onClose,
  fileId,
  fileName,
  mimeType,
  extension,
}) => {
  const [format, setFormat] = useState('');
  const [action, setAction] = useState<'download' | 'save'>('download');
  const formatId = useId();

  useEffect(() => {
    if (isOpen) {
      setFormat('');
      setAction('download');
    }
  }, [isOpen, fileId]);

  const supported = isConvertSupported(mimeType, extension);

  return (
    <Modal native isOpen={isOpen} onClose={onClose} title="Конвертация файла">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!format || !supported) return;
          event.currentTarget.closest('dialog')?.close();
          onClose();
          void startFileConversion(fileId, fileName, format, action);
        }}
      >
        <div className="space-y-1 text-sm text-theme-secondary">
          <p className="break-words">
            Файл: <span className="font-medium text-theme-primary">{fileName}</span>
          </p>
          <p>Тип: {getFileTypeDisplay(mimeType, extension)}</p>
        </div>

        {supported ? (
          <>
            <p className="rounded-theme border border-theme bg-brand-light p-3 text-sm text-theme-primary">
              Некоторые форматы не полностью совместимы. Результат может отличаться от оригинала.
            </p>
            <div className="space-y-2">
              <label htmlFor={formatId} className="block text-sm text-theme-secondary">
                Выберите формат
              </label>
              <select
                id={formatId}
                value={format}
                onChange={(event) => setFormat(event.target.value)}
                className="min-h-11 w-full rounded-theme border border-theme bg-theme-tertiary px-3 text-base text-theme-primary focus-visible:ring-2 focus-visible:ring-brand md:text-sm"
              >
                <option value="" disabled>
                  — выберите формат —
                </option>
                {getAvailableConvertFormats(mimeType, extension).map((value) => (
                  <option key={value} value={value}>
                    {value.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <fieldset>
              <legend className="mb-2 text-sm text-theme-secondary">Выберите действие</legend>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={action === 'download' ? 'primary' : 'secondary'}
                  aria-pressed={action === 'download'}
                  onClick={() => setAction('download')}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2"
                >
                  <Download size={16} aria-hidden="true" />
                  Скачать
                </Button>
                <Button
                  type="button"
                  variant={action === 'save' ? 'primary' : 'secondary'}
                  aria-pressed={action === 'save'}
                  onClick={() => setAction('save')}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2"
                >
                  <Save size={16} aria-hidden="true" />
                  Сохранить
                </Button>
              </div>
              <p className="mt-2 text-sm text-theme-secondary">
                {action === 'save'
                  ? 'Файл будет сохранён в ту же папку'
                  : 'Скачивание начнётся после конвертации'}
              </p>
            </fieldset>
          </>
        ) : (
          <div className="space-y-2 py-4 text-center text-sm text-theme-secondary">
            <AlertCircle size={32} className="mx-auto" aria-hidden="true" />
            <p>Конвертация этого файла не поддерживается.</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-theme pt-4">
          <Button type="button" variant="secondary" onClick={onClose} className="min-h-11 flex-1">
            Отмена
          </Button>
          {supported && (
            <Button type="submit" disabled={!format} className="min-h-11 flex-1">
              {action === 'download'
                ? `Скачать ${format.toUpperCase()}`.trim()
                : `Сохранить как ${format.toUpperCase()}`.trim()}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
};
