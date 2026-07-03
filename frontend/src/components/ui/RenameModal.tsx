import React, { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { cn } from '../../utils/cn';

interface RenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentName: string;
  extension?: string;
  type: 'file' | 'directory';
  onRename: (newName: string) => Promise<void>;
}

export const RenameModal: React.FC<RenameModalProps> = ({
  isOpen,
  onClose,
  currentName,
  extension,
  type,
  onRename,
}) => {
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (type === 'file' && extension) {
        setName(currentName.slice(0, -extension.length - 1));
      } else {
        setName(currentName);
      }
      setError('');
    }
  }, [isOpen, currentName, extension, type]);

  const trimmed = name.trim();
  const finalName = type === 'file' && extension ? `${trimmed}.${extension}` : trimmed;
  const isUnchanged = finalName === currentName;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUnchanged) return;
    if (!trimmed) {
      setError('Имя не может быть пустым');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      await onRename(finalName);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось переименовать');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Переименовать ${type === 'file' ? 'файл' : 'папку'}`}
      maxWidth="sm"
      showCloseButton={false}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-1.5">
            {type === 'file' ? 'Имя файла' : 'Имя папки'}
          </label>
          <div className="flex items-center gap-0.5">
            <div className="relative flex-1 group/input">
              <Pencil
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted group-hover/input:text-brand pointer-events-none transition-colors"
              />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                className={cn(
                  'w-full bg-theme-tertiary border border-theme rounded-theme-md py-2.5 pl-10 pr-3 text-sm text-theme-primary',
                  'placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition-colors',
                )}
              />
            </div>
            {type === 'file' && extension && (
              <span className="px-3 py-2.5 text-sm text-theme-muted bg-theme-tertiary border border-theme rounded-theme-md select-none">
                .{extension}
              </span>
            )}
          </div>
          {error && <p className="text-danger text-sm mt-2">{error}</p>}
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Отмена
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting || isUnchanged}
            className="flex-1"
          >
            {isSubmitting ? 'Переименование...' : 'Переименовать'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
