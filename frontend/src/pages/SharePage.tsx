import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Download, EyeOff, Image, KeyRound, Eye, Copy, Check } from 'lucide-react';
import { resolveShareLink, ShareLinkResolveResult } from '../api/sharelinks';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../hooks/useToast';
import SEOHead from '../components/SEOHead';
import { FileIcon } from '../components/ui/FileIcon';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { resolveFileIconType, getFileTypeDisplay } from '../utils/fileType';
import { formatFileSize, formatDate } from '../utils/format';

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

const PROBLEMATIC_EXTENSIONS = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']);

type PreviewType = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'code' | 'unsupported';

function determinePreviewType(mimeType: string, extension: string): PreviewType {
  const ext = extension.replace(/^\./, '').toLowerCase();
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'unsupported';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'unsupported';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'unsupported';
  if (mimeType.startsWith('text/')) return 'text';
  if (SUPPORTED_EXTENSIONS_FOR_VIEW.has(ext)) {
    return CODE_EXTENSIONS.has(ext) ? 'code' : 'text';
  }
  return 'unsupported';
}

const SharePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const accessToken = useAuthStore((state) => state.accessToken);

  const [file, setFile] = useState<ShareLinkResolveResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<PreviewType>('unsupported');
  const [canPreview, setCanPreview] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const showToast = useToastStore((s) => s.showToast);

  useEffect(() => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    setIframeError(false);

    resolveShareLink(token, accessToken)
      .then((data) => {
        setFile(data);
        const ext = data.extension.replace(/^\./, '').toLowerCase();
        const preview = determinePreviewType(data.mime_type, data.extension);
        setPreviewType(preview);
        setCanPreview(preview !== 'unsupported' && !PROBLEMATIC_EXTENSIONS.has(ext));
      })
      .catch((err: any) => {
        if (err?.status === 404) {
          setError('Ссылка не найдена или истёк срок действия');
        } else if (err?.status === 401) {
          setError('Для доступа к этому файлу необходимо войти в аккаунт');
        } else if (err?.status === 403) {
          setNeedsPassword(true);
        } else {
          setError(err?.message || 'Не удалось загрузить файл');
        }
      })
      .finally(() => setIsLoading(false));
  }, [token, accessToken]);

  const handleDownload = useCallback(async () => {
    if (!file?.url) return;
    try {
      const response = await fetch(file.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch {
      window.open(file.url, '_blank');
    }
  }, [file]);

  const handleCopyFilename = useCallback(() => {
    if (!file || isCopied) return;
    navigator.clipboard
      .writeText(file.filename)
      .then(() => {
        setIsCopied(true);
        showToast('Название файла скопировано', 'success');
        setTimeout(() => setIsCopied(false), 5000);
      })
      .catch(() => {
        showToast('Не удалось скопировать название', 'error');
      });
  }, [file, showToast, isCopied]);

  const handleIframeError = useCallback(() => {
    setIframeError(true);
    setCanPreview(false);
  }, []);

  const handlePasswordSubmit = async () => {
    if (!token || !password) return;
    setIsSubmittingPassword(true);
    setPasswordError(null);
    try {
      const data = await resolveShareLink(token, accessToken, password);
      setFile(data);
      const ext = data.extension.replace(/^\./, '').toLowerCase();
      const preview = determinePreviewType(data.mime_type, data.extension);
      setPreviewType(preview);
      setCanPreview(preview !== 'unsupported' && !PROBLEMATIC_EXTENSIONS.has(ext));
      setNeedsPassword(false);
    } catch (err: any) {
      if (err?.status === 403) {
        setPasswordError('Неверный пароль');
      } else {
        setPasswordError(err?.message || 'Ошибка');
      }
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  const renderUnavailableMessage = (message?: string, subMessage?: string) => (
    <div className="bg-theme-tertiary rounded-theme-lg py-16 flex flex-col items-center gap-4 text-theme-muted">
      <EyeOff size={64} className="text-theme-muted" />
      <p className="text-base font-medium">{message || 'Просмотр недоступен'}</p>
      <p className="text-sm">{subMessage || 'Файл не может быть отображён в браузере'}</p>
      <button
        onClick={handleDownload}
        className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-brand text-theme-on-brand hover:bg-brand-hover rounded-theme-md transition-colors text-sm font-medium"
      >
        <Download size={16} />
        Скачать файл
      </button>
    </div>
  );

  const renderPreview = () => {
    if (!file) return null;
    if (!canPreview || iframeError) return renderUnavailableMessage();

    switch (previewType) {
      case 'image':
        return (
          <div className="flex items-center justify-center bg-theme-tertiary rounded-theme-lg overflow-hidden min-h-[400px]">
            {file.url ? (
              <img
                src={file.url}
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
            <video
              src={file.url}
              controls
              className="w-full max-h-[70vh]"
              onError={handleIframeError}
            />
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
              <audio
                src={file.url}
                controls
                className="w-full max-w-md"
                onError={handleIframeError}
              />
            </div>
          </div>
        );

      case 'pdf':
        return (
          <div className="bg-theme-tertiary rounded-theme-lg overflow-hidden min-h-[500px]">
            {file.url ? (
              <object
                data={file.url}
                type="application/pdf"
                className="w-full h-[70vh]"
                onError={handleIframeError}
              >
                {renderUnavailableMessage('Не удалось загрузить PDF', 'Попробуйте скачать файл')}
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
          <div className="bg-theme-tertiary rounded-theme-lg overflow-hidden min-h-[400px]">
            {file.url ? (
              <iframe
                ref={iframeRef}
                src={file.url}
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

      default:
        return renderUnavailableMessage();
    }
  };

  const ogTitle = file ? `${file.filename}` : 'Файл';
  const ogDescription = file
    ? `Файл · ${formatFileSize(file.size)} · Владелец: ${file.owner_username}`
    : 'Просмотр файла в SharedSpace';
  const ogImage = file && file.mime_type.startsWith('image/') && file.url ? file.url : undefined;

  if (needsPassword && !file) {
    return (
      <div className="flex items-center justify-center min-h-[80vh] px-4">
        <SEOHead title="Файл защищён паролем" description="Для доступа к файлу требуется пароль." />
        <Card className="w-full max-w-md">
          <div className="text-center space-y-1 mb-6">
            <div className="w-12 h-12 mx-auto flex items-center justify-center bg-brand/10 rounded-full mb-3">
              <KeyRound size={22} className="text-brand" />
            </div>
            <h2 className="text-xl font-semibold text-theme-primary">Файл защищён паролем</h2>
            <p className="text-sm text-theme-muted">Введите пароль для доступа к файлу</p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="relative group">
              <KeyRound
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted group-hover:text-brand transition-colors"
              />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                placeholder="Пароль"
                autoComplete="new-password"
                autoFocus
                className="w-full pl-9 pr-10 py-2 rounded-theme-md border border-theme bg-theme-primary text-theme-primary outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted hover:text-brand transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {passwordError && <p className="text-sm text-danger">{passwordError}</p>}
            <Button
              onClick={handlePasswordSubmit}
              disabled={!password || isSubmittingPassword}
              className="mt-1 w-full"
            >
              {isSubmittingPassword ? 'Проверка...' : 'Открыть файл'}
            </Button>
          </div>
          <p className="mt-6 text-center text-sm text-theme-secondary">
            <Link
              to={accessToken ? '/dashboard' : '/'}
              className="text-brand hover:text-brand-hover font-medium"
            >
              ← SharedSpace
            </Link>
          </p>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center bg-theme-primary">
        <SEOHead title="Загрузка..." description="Загрузка информации о файле..." />
        <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !file) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center bg-theme-primary px-4">
        <SEOHead title="Файл недоступен" description={error || 'Файл не найден'} />
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 mx-auto flex items-center justify-center bg-danger-light rounded-full">
            <FileIcon type="unknown" size={28} />
          </div>
          <h1 className="text-xl font-semibold text-theme-primary">Файл недоступен</h1>
          <p className="text-sm text-theme-secondary">{error || 'Файл не найден'}</p>
          <Link to="/">
            <Button variant="primary" className="mt-2">
              На главную
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const fileIconType = resolveFileIconType(file.mime_type, file.extension);

  return (
    <div className="space-y-6 pb-10">
      <SEOHead
        title={ogTitle}
        description={ogDescription}
        ogImage={ogImage}
        canonical={`https://team5.st.ifbest.org/share/${token}`}
      />
      {/* Навигация назад */}
      <div>
        <Link
          to={accessToken ? '/dashboard' : '/'}
          className="inline-flex items-center gap-2 text-sm text-theme-secondary hover:text-theme-primary transition-colors"
        >
          <ArrowLeft size={16} />
          SharedSpace
        </Link>
      </div>
      {/* Основной контент: 2 колонки (предпросмотр) + 1 колонка (информация) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Левая часть: предпросмотр (2/3) */}
        <div className="lg:col-span-2">
          <div className="bg-theme-secondary border border-theme rounded-theme-lg p-4 shadow-theme-card">
            <h2 className="text-sm font-medium text-theme-secondary mb-3">Предпросмотр</h2>
            {renderPreview()}
          </div>
        </div>

        {/* Правая часть: информация (1/3) */}
        <div className="space-y-4">
          {/* Информация о файле */}
          <div className="bg-theme-secondary border border-theme rounded-theme-lg p-5 shadow-theme-card">
            <h3 className="font-medium text-theme-primary mb-3">Информация о файле</h3>

            <button
              onClick={handleCopyFilename}
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
                  {isCopied ? (
                    <>
                      <Check size={11} className="text-green-500" />
                      Скопировано
                    </>
                  ) : (
                    <>
                      <Copy size={11} />
                      Нажмите, чтобы скопировать
                    </>
                  )}
                </p>
              </div>
            </button>

            <div className="my-4 border-t border-theme" />

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
                <span className="text-theme-primary font-medium">{file.owner_username}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-theme-secondary">Создан</span>
                <span className="text-theme-primary font-medium">
                  {formatDate(file.created_at)}
                </span>
              </div>
            </div>
          </div>

          {/* Действия */}
          <div className="bg-theme-secondary border border-theme rounded-theme-lg p-5 shadow-theme-card">
            <h3 className="font-medium text-theme-primary mb-3">Действия</h3>
            <button
              onClick={handleDownload}
              className="group w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-brand text-theme-on-brand hover:bg-brand-hover rounded-theme-md transition-colors text-sm font-medium"
            >
              <Download
                size={16}
                className="group-hover:[animation:ss-bounce-up_0.4s_ease-in-out]"
              />
              Скачать
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharePage;
