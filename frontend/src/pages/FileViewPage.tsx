import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Share2, Star, Image, EyeOff, Trash2, Pencil } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import type { AuthState } from '../store/authStore';
import { useFavorites } from '../hooks/useFavorites';
import {
  getFileMetadata,
  getFileContentUrl,
  FileMetadata,
  softDeleteFile,
  renameFile,
} from '../api/files';
import { getDirectoryById, Directory } from '../api/directories';
import { getUserById } from '../api/users';
import { ApiError } from '../api/client';
import { FileIcon } from '../components/ui/FileIcon';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { RenameModal } from '../components/ui/RenameModal';
import { ConvertModal } from '../components/ui/ConvertModal';
import { useFileConversion } from '../hooks/useFileConversion';
import { ShareLinkModal } from '../components/ui/ShareLinkModal';
import { resolveFileIconType, getFileTypeDisplay } from '../utils/fileType';
import { formatFileSize, formatDate } from '../utils/format';
import { useToastStore } from '../hooks/useToast';
import SEOHead from '../components/SEOHead';
import { cn } from '../utils/cn';

// Определяем типы файлов для предпросмотра
type PreviewType =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'text'
  | 'code'
  | 'presentation'
  | 'spreadsheet'
  | 'doc'
  | 'unsupported';

// Расширения, которые поддерживаются для просмотра через iframe
const SUPPORTED_EXTENSIONS_FOR_VIEW = new Set([
  'pdf',
  'txt',
  'md',
  'csv',
  'xml',
  'json',
  'js',
  'ts',
  'jsx',
  'tsx',
  'html',
  'css',
  'scss',
  'py',
  'java',
  'cpp',
  'c',
  'go',
  'rs',
  'rb',
  'php',
  'sh',
  'bash',
  'sql',
  'yaml',
  'yml',
]);

// Расширения для кода
const CODE_EXTENSIONS = new Set([
  'js',
  'ts',
  'jsx',
  'tsx',
  'html',
  'css',
  'scss',
  'json',
  'xml',
  'yaml',
  'yml',
  'py',
  'java',
  'cpp',
  'c',
  'go',
  'rs',
  'rb',
  'php',
  'sh',
  'bash',
  'sql',
]);

// Расширения, которые часто блокируются браузером в iframe
const PROBLEMATIC_EXTENSIONS = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'go']);

const FileViewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const accessToken = useAuthStore((state: AuthState) => state.accessToken);
  const user = useAuthStore((state: AuthState) => state.user);
  const { isFavorite, toggleFavorite } = useFavorites();
  const { isConverting, conversionProgress, convertAndDownload, convertAndSave } =
    useFileConversion();
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const showToast = useToastStore((s) => s.showToast);

  const [file, setFile] = useState<FileMetadata | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [ownerUsername, setOwnerUsername] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<PreviewType>('unsupported');
  const [canPreview, setCanPreview] = useState(true);
  const [iframeError, setIframeError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Определяем тип для предпросмотра на основе MIME-типа и расширения
  const determinePreviewType = useCallback((mimeType: string, extension: string): PreviewType => {
    const ext = extension.replace(/^\./, '').toLowerCase();

    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.startsWith('text/')) return 'text';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'spreadsheet';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'presentation';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'doc';

    // Проверка по расширению
    if (SUPPORTED_EXTENSIONS_FOR_VIEW.has(ext)) {
      if (CODE_EXTENSIONS.has(ext)) return 'code';
      return 'text';
    }

    return 'unsupported';
  }, []);

  // Проверяем, проблемный ли файл для iframe
  const isProblematicForIframe = useCallback((filename: string): boolean => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return PROBLEMATIC_EXTENSIONS.has(ext);
  }, []);

  // Загрузка данных файла
  useEffect(() => {
    if (!accessToken || !id) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);
    setCanPreview(true);
    setIframeError(false);
    setOwnerUsername(null);

    const loadFileData = async () => {
      try {
        // Получаем метаданные файла
        const fileData = await getFileMetadata(accessToken, id);
        if (!isMounted) return;
        setFile(fileData);

        // Получаем username владельца, если он не текущий пользователь
        if (fileData.owner_id !== user?.id) {
          try {
            const owner = await getUserById(accessToken, fileData.owner_id);
            if (isMounted) {
              setOwnerUsername(owner.username);
            }
          } catch (err) {
            console.warn('Не удалось получить username владельца:', err);
            // Оставляем null - будет показан fallback с ID
          }
        }

        // Определяем тип для предпросмотра
        const preview = determinePreviewType(fileData.mime_type, fileData.extension);
        setPreviewType(preview);

        // Проверяем, поддерживается ли просмотр
        const isViewable = preview !== 'unsupported';
        setCanPreview(isViewable);

        // Если файл проблемный для iframe, сразу помечаем как непросматриваемый
        if (isProblematicForIframe(fileData.filename)) {
          setCanPreview(false);
          if (isMounted) {
            setIsLoading(false);
          }
          return;
        }

        // Загружаем URL для предпросмотра (только для поддерживаемых типов)
        if (isViewable) {
          try {
            const content = await getFileContentUrl(accessToken, id);
            if (isMounted) {
              setFileUrl(content.url);
            }
          } catch (err) {
            console.warn('Не удалось получить URL для предпросмотра:', err);
          }
        }

        // Получаем информацию о директории
        try {
          const dir = await getDirectoryById(accessToken, fileData.directory_id);
          if (isMounted) {
            setDirectory(dir);
          }
        } catch (err) {
          console.warn('Не удалось загрузить информацию о директории:', err);
        }
      } catch (err) {
        if (!isMounted) return;
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('Не удалось загрузить файл');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadFileData();

    return () => {
      isMounted = false;
    };
  }, [accessToken, id, determinePreviewType, isProblematicForIframe, user?.id]);

  // Функция для получения отображаемого имени владельца
  const getOwnerDisplayName = useCallback(() => {
    if (!file) return '';
    if (file.owner_id === user?.id) return 'Вы';
    if (ownerUsername) return ownerUsername;
    return `Пользователь ${file.owner_id.slice(0, 8)}`;
  }, [file, user, ownerUsername]);

  // Получаем расширение файла без точки
  const getFileExtension = (filename: string): string => {
    const ext = filename.split('.').pop() || '';
    return ext.toLowerCase();
  };

  // Функция для скачивания файла с правильным именем
  const downloadFile = useCallback(async () => {
    if (!accessToken || !id || !file) return;
    try {
      const content = await getFileContentUrl(accessToken, id);

      // Используем fetch для получения файла с правильным именем
      const response = await fetch(content.url);
      const blob = await response.blob();

      // Создаём ссылку для скачивания
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Освобождаем URL объект
      setTimeout(() => URL.revokeObjectURL(link.href), 100);
    } catch (err) {
      console.error('Ошибка скачивания:', err);
      // Fallback: открыть в новой вкладке
      try {
        const content = await getFileContentUrl(accessToken, id);
        window.open(content.url, '_blank');
      } catch (e) {
        console.error('Ошибка при fallback скачивании:', e);
      }
    }
  }, [accessToken, id, file]);

  // Обработчик переключения избранного
  const handleToggleFavorite = useCallback(() => {
    if (file) {
      toggleFavorite(file.id);
    }
  }, [file, toggleFavorite]);

  // Обработчик перехода назад
  const handleGoBack = useCallback(() => {
    if (directory) {
      navigate(`/directories/${directory.id}`, {
        state: {
          fromFile: true,
          directoryId: directory.id,
        },
      });
    } else {
      navigate(-1);
    }
  }, [directory, navigate]);

  // Обработчик удаления файла
  const handleDeleteFile = useCallback(async () => {
    if (!accessToken || !id) return;

    setIsDeleting(true);
    setDeleteError('');
    try {
      await softDeleteFile(accessToken, id);
      setIsDeleteModalOpen(false);
      if (directory) {
        navigate(`/directories/${directory.id}`);
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Не удалось удалить файл');
    } finally {
      setIsDeleting(false);
    }
  }, [accessToken, id, directory, navigate]);

  // Обработчик ошибки iframe
  const handleIframeError = useCallback(() => {
    setIframeError(true);
    setCanPreview(false);
  }, []);

  const handleConvertAndDownload = useCallback(
    (format: string) => {
      if (!file) return Promise.reject('No file');
      return convertAndDownload(file.id, format, file.filename);
    },
    [convertAndDownload, file],
  );

  const handleConvertAndSave = useCallback(
    (format: string) => {
      if (!file) return Promise.reject('No file');
      return convertAndSave(file.id, format, file.filename);
    },
    [convertAndSave, file],
  );

  const handleRename = async (newName: string) => {
    if (!file || !accessToken) return;
    await renameFile(accessToken, file.id, newName);
    setFile((prev) => (prev ? { ...prev, filename: newName } : null));
    showToast(`Файл переименован в «${newName}»`, 'success');
  };

  // Функция для рендера сообщения о недоступности просмотра
  const renderUnavailableMessage = (message?: string, subMessage?: string) => {
    return (
      <div className="bg-theme-tertiary rounded-theme-lg py-16 flex flex-col items-center gap-4 text-theme-muted">
        <EyeOff size={64} className="text-theme-muted" />
        <p className="text-base font-medium">{message || 'Просмотр недоступен'}</p>
        <p className="text-sm">{subMessage || 'Файл не может быть отображён в браузере'}</p>
        <button
          onClick={downloadFile}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 border border-theme bg-theme-secondary text-theme-secondary hover:text-theme-primary hover:bg-theme-hover rounded-theme-md transition-colors text-sm font-medium"
        >
          <Download size={16} />
          Скачать файл
        </button>
      </div>
    );
  };

  // Функция для рендера предпросмотра
  const renderPreview = () => {
    if (!file) return null;

    // Если файл не поддерживается для просмотра или произошла ошибка в iframe
    if (!canPreview || iframeError) {
      const ext = getFileExtension(file.filename);
      let message = 'Просмотр недоступен';
      let subMessage = 'Файл не может быть отображён в браузере';

      if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
        subMessage = 'Архивы не поддерживаются для просмотра';
      } else if (PROBLEMATIC_EXTENSIONS.has(ext)) {
        message = 'Предпросмотр недоступен';
        subMessage = 'Файлы этого формата не поддерживаются для просмотра в браузере';
      }

      return renderUnavailableMessage(message, subMessage);
    }

    switch (previewType) {
      case 'image':
        return (
          <div className="flex items-center justify-center bg-theme-tertiary rounded-theme-lg overflow-hidden min-h-[400px]">
            {fileUrl ? (
              <img
                src={fileUrl}
                alt={file.filename}
                className="max-w-full max-h-[70vh] object-contain"
                onError={() => {
                  setCanPreview(false);
                  setIframeError(true);
                }}
              />
            ) : (
              <div className="flex flex-col items-center gap-4 py-12 text-theme-muted">
                <Image size={48} />
                <p>Загрузка изображения...</p>
              </div>
            )}
          </div>
        );

      case 'video':
        return (
          <div className="bg-theme-tertiary rounded-theme-lg overflow-hidden">
            {fileUrl ? (
              <video
                src={fileUrl}
                controls
                className="w-full max-h-[70vh]"
                controlsList="nodownload"
                onError={handleIframeError}
              />
            ) : (
              <div className="flex flex-col items-center gap-4 py-12 text-theme-muted">
                <FileIcon type="video" size={48} />
                <p>Загрузка видео...</p>
              </div>
            )}
          </div>
        );

      case 'audio':
        return (
          <div className="bg-theme-tertiary rounded-theme-lg p-8">
            <div className="flex flex-col items-center gap-6">
              <div className="w-24 h-24 rounded-theme-full bg-brand-light flex items-center justify-center text-brand">
                <FileIcon type="audio" size={40} />
              </div>
              <p className="text-lg font-medium text-theme-primary">{file.filename}</p>
              {fileUrl ? (
                <audio
                  src={fileUrl}
                  controls
                  className="w-full max-w-md"
                  controlsList="nodownload"
                  onError={handleIframeError}
                />
              ) : (
                <p className="text-theme-muted">Загрузка аудио...</p>
              )}
            </div>
          </div>
        );

      case 'pdf':
        return (
          <div className="bg-theme-tertiary rounded-theme-lg overflow-hidden min-h-[500px] relative">
            {fileUrl ? (
              <object
                data={fileUrl}
                type="application/pdf"
                className="w-full h-[70vh]"
                onError={handleIframeError}
              >
                {renderUnavailableMessage(
                  'Не удалось загрузить PDF',
                  'Попробуйте скачать файл для просмотра',
                )}
              </object>
            ) : (
              <div className="flex flex-col items-center gap-4 py-12 text-theme-muted">
                <FileIcon type="pdf" size={48} />
                <p>Загрузка PDF...</p>
              </div>
            )}
          </div>
        );

      case 'text':
      case 'code':
        return (
          <div className="bg-theme-tertiary rounded-theme-lg overflow-hidden min-h-[400px] relative">
            {fileUrl ? (
              <iframe
                ref={iframeRef}
                src={fileUrl}
                className="w-full h-[70vh]"
                title={file.filename}
                sandbox="allow-scripts allow-same-origin"
                onError={handleIframeError}
              />
            ) : (
              <div className="flex flex-col items-center gap-4 py-12 text-theme-muted">
                <FileIcon type={previewType === 'code' ? 'code' : 'text'} size={48} />
                <p>Загрузка файла...</p>
              </div>
            )}
          </div>
        );

      case 'spreadsheet':
      case 'presentation':
      case 'doc':
        return renderUnavailableMessage(
          'Предпросмотр недоступен',
          'Файлы офисных форматов не поддерживаются для просмотра в браузере',
        );

      default:
        return renderUnavailableMessage();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <SEOHead title="Загрузка..." description="Загрузка информации о файле..." />
        <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !file) {
    return (
      <div className="py-12 text-center">
        <SEOHead title="Файл недоступен" description={error || 'Файл не найден'} />
        <p className="text-theme-secondary">{error || 'Файл не найден'}</p>
        <Button variant="secondary" onClick={() => navigate('/dashboard')} className="mt-4">
          Вернуться на дашборд
        </Button>
      </div>
    );
  }

  const fileIconType = resolveFileIconType(file.mime_type, file.extension);
  const isFav = isFavorite(file.id);

  return (
    <div className="space-y-6 pb-10">
      <SEOHead
        title={file.filename}
        description={`Файл · ${formatFileSize(file.size)} · ${file.mime_type}`}
        canonical={`https://shared-space.ru/files/${file.id}`}
      />
      {/* Навигация назад */}
      <div>
        <button
          onClick={handleGoBack}
          className="inline-flex items-center gap-2 text-sm text-theme-secondary hover:text-theme-primary transition-colors"
        >
          <ArrowLeft size={16} />
          Вернуться к папке
        </button>
      </div>

      {/* Основной контент: 2 колонки (предпросмотр) + 1 колонка (информация) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Левая часть: предпросмотр (2/3) */}
        <div className="lg:col-span-2">
          <div className="bg-theme-secondary border border-theme rounded-theme-lg p-4 shadow-theme-card">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-theme-secondary">Предпросмотр</h2>
              <button
                onClick={downloadFile}
                aria-label="Скачать файл"
                title="Скачать файл"
                className="group inline-flex h-9 w-9 items-center justify-center gap-2 rounded-theme-md border border-brand/30 bg-brand-light text-brand transition-colors hover:bg-brand hover:text-theme-on-brand sm:w-auto sm:px-3 sm:text-sm sm:font-medium"
              >
                <Download
                  size={16}
                  className="group-hover:[animation:ss-bounce-up_0.4s_ease-in-out]"
                />
                <span className="hidden sm:inline">Скачать</span>
              </button>
            </div>
            {renderPreview()}
          </div>
        </div>

        {/* Правая часть: информация о файле (1/3) */}
        <div className="space-y-4">
          {/* Информация о файле */}
          <div className="bg-theme-secondary border border-theme rounded-theme-lg p-5 shadow-theme-card">
            <h3 className="font-medium text-theme-primary mb-3">Информация о файле</h3>

            {/* Отображение файла с возможностью переименовать */}
            <button
              onClick={() => setIsRenameModalOpen(true)}
              className="group flex items-center gap-3 p-3 bg-theme-tertiary hover:bg-theme-hover rounded-theme-md border border-theme transition-colors w-full text-left"
            >
              <div className="p-2 bg-theme-secondary rounded-theme-sm shadow-theme-card shrink-0 group-hover:text-brand transition-colors">
                <FileIcon
                  type={fileIconType}
                  size={20}
                  className="group-hover:text-brand transition-colors"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-theme-primary font-medium truncate">{file.filename}</p>
                <p className="text-xs text-theme-muted flex items-center gap-1">
                  <Pencil size={11} />
                  Нажмите, чтобы переименовать
                </p>
              </div>
            </button>

            {/* Разделитель */}
            <div className="my-4 border-t border-theme" />

            {/* Характеристики */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-theme-secondary">Тип</span>
                <span className="text-theme-primary font-medium">
                  {getFileTypeDisplay(file.mime_type, file.extension)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-theme-secondary">Размер</span>
                <span className="text-theme-primary font-medium">{formatFileSize(file.size)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-theme-secondary">Владелец</span>
                <span className="text-theme-primary font-medium">{getOwnerDisplayName()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-theme-secondary">Создан</span>
                <span className="text-theme-primary font-medium">
                  {formatDate(file.created_at)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-theme-secondary">Изменён</span>
                <span className="text-theme-primary font-medium">
                  {formatDate(file.updated_at)}
                </span>
              </div>
            </div>
          </div>

          {/* Действия */}
          <div className="bg-theme-secondary border border-theme rounded-theme-lg p-5 shadow-theme-card">
            <h3 className="font-medium text-theme-primary mb-3">Действия</h3>
            <div className="space-y-2">
              <button
                onClick={() => setIsShareModalOpen(true)}
                className="group w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-theme bg-theme-secondary text-theme-secondary hover:text-theme-primary hover:bg-theme-hover rounded-theme-md transition-colors text-sm font-medium"
              >
                <Share2 size={16} className="group-hover:text-green-500 transition-colors" />
                Поделиться ссылкой
              </button>

              <button
                onClick={handleToggleFavorite}
                className="group w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-theme bg-theme-secondary text-theme-secondary hover:text-theme-primary hover:bg-theme-hover rounded-theme-md transition-colors text-sm font-medium"
              >
                <Star
                  size={16}
                  fill={isFav ? 'currentColor' : 'transparent'}
                  className={cn(
                    'transition-[fill,color] duration-200',
                    isFav ? 'text-yellow-400' : 'text-theme-muted group-hover:fill-transparent',
                    isFav ? '' : 'group-hover:text-yellow-400',
                  )}
                />
                <span className="min-w-[150px] text-left">
                  {isFav ? 'Убрать из Избранного' : 'Добавить в Избранное'}
                </span>
              </button>

              <button
                onClick={() => setIsDeleteModalOpen(true)}
                className="group w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-theme bg-theme-secondary text-theme-secondary hover:text-theme-primary hover:bg-theme-hover rounded-theme-md transition-colors text-sm font-medium"
              >
                <Trash2 size={16} className="group-hover:text-red-500 transition-colors" />
                Удалить файл
              </button>
            </div>

            {/* Конвертация файла */}
            <div className="mt-4 pt-4 border-t border-theme">
              <button
                onClick={() => setIsConvertModalOpen(true)}
                className="group w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-theme bg-theme-secondary text-theme-secondary hover:text-theme-primary hover:bg-theme-hover rounded-theme-md transition-colors text-sm font-medium"
              >
                <Image size={16} className="group-hover:text-brand transition-colors" />
                Конвертировать
              </button>
            </div>

            <ConvertModal
              isOpen={isConvertModalOpen}
              onClose={() => setIsConvertModalOpen(false)}
              fileId={file.id}
              fileName={file.filename}
              mimeType={file.mime_type}
              extension={file.extension}
              onConvertAndDownload={handleConvertAndDownload}
              onConvertAndSave={handleConvertAndSave}
              isConverting={isConverting}
              conversionProgress={conversionProgress}
            />

            {accessToken && (
              <ShareLinkModal
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                itemId={file.id}
                itemName={file.filename}
                itemType="file"
                accessToken={accessToken}
              />
            )}

            <ConfirmModal
              isOpen={isDeleteModalOpen}
              onClose={() => !isDeleting && setIsDeleteModalOpen(false)}
              onConfirm={handleDeleteFile}
              variant="danger"
              isConfirming={isDeleting}
              confirmLabel="Удалить"
              error={deleteError}
              title={<h3 className="font-medium text-theme-primary">Удалить «{file.filename}»?</h3>}
              description={
                <p className="text-sm text-theme-secondary">
                  Файл будет перемещён в корзину. Вы сможете восстановить его позже.
                </p>
              }
            />

            <RenameModal
              isOpen={isRenameModalOpen}
              onClose={() => setIsRenameModalOpen(false)}
              currentName={file.filename}
              extension={file.extension}
              type="file"
              onRename={handleRename}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileViewPage;
