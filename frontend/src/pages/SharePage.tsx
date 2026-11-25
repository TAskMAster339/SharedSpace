import React, { useEffect, useState, useCallback, useId, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Download,
  EyeOff,
  Image,
  KeyRound,
  Eye,
  Copy,
  Check,
  Maximize,
  Minimize,
} from 'lucide-react';
import {
  resolveShareLink,
  ShareLinkResolveResult,
  startSharedOfficePreview,
} from '../api/sharelinks';
import { Layout, useReaderLayout } from '../components/Layout';
import { cn } from '../utils/cn';
import { ApiError } from '../api/client';
import type { OfficeLayout, OfficeTheme } from '../api/documents';
import { useRootTheme } from '../hooks/useTheme';
import { MobileReaderLayout } from '../components/ui/MobileReaderLayout';
import { MobileDocxReader } from '../components/ui/MobileDocxReader';
import { usePhoneViewport } from '../hooks/usePhoneViewport';
import { OfficeFrame } from '../components/ui/OfficeFrame';
import { canPreviewOfficeFile, canUseMobileOfficeReader } from '../utils/officeFormats';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../hooks/useToast';
import SEOHead from '../components/SEOHead';
import { AudioPreview } from '../components/ui/AudioPreview';
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

type PreviewType = 'office' | 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'code' | 'unsupported';

function determinePreviewType(file: ShareLinkResolveResult): PreviewType {
  if (canPreviewOfficeFile(file.filename)) return 'office';
  const mimeType = file.mime_type;
  const ext = file.extension.replace(/^\./, '').toLowerCase();
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
  return token ? <SharedFileLayout key={token} token={token} /> : null;
};

type SharePreviewMode = 'default' | 'reader' | 'preview' | 'expanded';

function SharedFileLayout({ token }: { token: string }) {
  const [mode, setMode] = useState<SharePreviewMode>('default');
  return (
    <Layout fillViewport={mode === 'expanded'}>
      <SharedFile token={token} mode={mode} setMode={setMode} />
    </Layout>
  );
}

interface SharedFileProps {
  token: string;
  mode: SharePreviewMode;
  setMode: (mode: SharePreviewMode) => void;
}

const SharedFile = ({ token, mode, setMode }: SharedFileProps) => {
  const previewId = useId();
  const navigate = useNavigate();
  const phone = usePhoneViewport();
  const expanded = mode === 'expanded';
  const accessToken = useAuthStore((state) => state.accessToken);
  const officeTheme = useRootTheme();

  const [file, setFile] = useState<ShareLinkResolveResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [iframeError, setIframeError] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const acceptedPassword = useRef<string | undefined>(undefined);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const showToast = useToastStore((s) => s.showToast);

  const previewType = file ? determinePreviewType(file) : 'unsupported';
  const mobileDocx = phone && !!file?.url && file.filename.toLowerCase().endsWith('.docx');
  const mobileOffice = phone && !!file && canUseMobileOfficeReader(file.filename);
  const showMobileReader =
    (mobileDocx || mobileOffice) &&
    !isLoading &&
    !error &&
    (mode === 'default' || mode === 'reader');
  useReaderLayout(showMobileReader);
  const readerUrl = file?.url;
  const loadReaderUrl = useCallback(
    async (signal: AbortSignal) => {
      if (mode === 'reader') {
        const latest = await resolveShareLink(token, accessToken, acceptedPassword.current, signal);
        return latest.url;
      }
      if (!readerUrl) throw new Error('Файл недоступен');
      return readerUrl;
    },
    [mode, readerUrl, token, accessToken],
  );
  const loadOfficePreview = useCallback(
    (theme: OfficeTheme, signal: AbortSignal, layout?: OfficeLayout) =>
      startSharedOfficePreview(
        token,
        accessToken,
        acceptedPassword.current ?? '',
        theme,
        signal,
        layout,
      ),
    [token, accessToken],
  );

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    setFile(null);
    setNeedsPassword(false);
    setIframeError(false);

    resolveShareLink(token, accessToken, acceptedPassword.current, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setFile(data);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const status = err instanceof ApiError ? err.status : 0;
        if (status === 404) {
          setError('Ссылка не найдена или истёк срок действия');
        } else if (status === 401) {
          setError('Для доступа к этому файлу необходимо войти в аккаунт');
        } else if (status === 403) {
          acceptedPassword.current = undefined;
          setNeedsPassword(true);
        } else {
          setError(err instanceof Error ? err.message : 'Не удалось загрузить файл');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
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
  }, []);

  const handlePasswordSubmit = async () => {
    if (!password || isSubmittingPassword) return;
    setIsSubmittingPassword(true);
    setPasswordError(null);
    try {
      const data = await resolveShareLink(token, accessToken, password);
      acceptedPassword.current = password;
      setPassword('');
      setFile(data);
      setNeedsPassword(false);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 403) {
        setPasswordError('Неверный пароль');
      } else {
        setPasswordError(err instanceof Error ? err.message : 'Ошибка');
      }
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  const renderUnavailableMessage = (message?: string, subMessage?: string) => (
    <div className="bg-theme-tertiary rounded-theme py-16 flex flex-col items-center gap-4 text-theme-muted">
      <EyeOff size={64} className="text-theme-muted" />
      <p className="text-base font-medium">{message || 'Просмотр недоступен'}</p>
      <p className="text-sm">{subMessage || 'Файл не может быть отображён в браузере'}</p>
      <button
        onClick={handleDownload}
        className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-brand text-theme-on-brand hover:bg-brand-hover rounded-theme transition-colors text-sm font-medium"
      >
        <Download size={16} />
        Скачать файл
      </button>
    </div>
  );

  const renderPreview = () => {
    if (!file) return null;
    if (previewType === 'unsupported' || iframeError) return renderUnavailableMessage();

    switch (previewType) {
      case 'office':
        return (
          <div
            id={previewId}
            className={cn(
              'overflow-hidden',
              expanded
                ? 'min-h-0 flex-1'
                : 'h-[65dvh] min-h-[360px] rounded-theme border border-theme',
            )}
          >
            <OfficeFrame mode="view" theme={officeTheme} loadPreview={loadOfficePreview} />
          </div>
        );

      case 'image':
        return (
          <div className="flex items-center justify-center bg-theme-tertiary rounded-theme overflow-hidden min-h-[400px]">
            {file.url ? (
              <img
                src={file.url}
                alt={file.filename}
                className="max-w-full max-h-[70vh] object-contain"
                onError={handleIframeError}
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
          <div className="bg-theme-tertiary rounded-theme overflow-hidden">
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
          <AudioPreview
            key={file.file_id}
            name={file.filename}
            cover={file.cover_url}
            src={file.url}
            onError={handleIframeError}
          />
        );
      case 'pdf':
        return (
          <div className="bg-theme-tertiary rounded-theme overflow-hidden min-h-[500px]">
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
          <div className="bg-theme-tertiary rounded-theme overflow-hidden min-h-[400px]">
            {file.url ? (
              <iframe
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
            <div className="w-12 h-12 mx-auto flex items-center justify-center bg-brand/10 rounded-theme mb-3">
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
                className="w-full pl-9 pr-10 py-2 rounded-theme border border-theme bg-theme-primary text-theme-primary outline-none focus:border-brand"
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
        <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-[50%] animate-spin" />
      </div>
    );
  }

  if (error || !file) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center bg-theme-primary px-4">
        <SEOHead title="Файл недоступен" description={error || 'Файл не найден'} />
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 mx-auto flex items-center justify-center bg-danger-light rounded-theme">
            <FileIcon type="unknown" size={28} />
          </div>
          <h1 className="text-xl font-semibold text-theme-primary">Файл недоступен</h1>
          <p className="text-sm text-theme-secondary">{error || 'Файл не найден'}</p>
          <Link to={accessToken ? '/dashboard' : '/'}>
            <Button variant="primary" className="mt-2">
              На главную
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (showMobileReader) {
    return (
      <>
        <SEOHead
          title={ogTitle}
          description={ogDescription}
          canonical={`https://shared-space.ru/share/${token}`}
        />
        {mobileOffice ? (
          <MobileReaderLayout
            filename={file.filename}
            onBack={() => navigate(accessToken ? '/dashboard' : '/')}
            onStandardPreview={() => setMode('preview')}
            onDownload={handleDownload}
          >
            <div className="min-h-0 flex-1 pb-[env(safe-area-inset-bottom)]">
              <OfficeFrame
                mode="view"
                theme={officeTheme}
                layout="reader"
                loadPreview={loadOfficePreview}
              />
            </div>
          </MobileReaderLayout>
        ) : (
          <MobileDocxReader
            filename={file.filename}
            size={file.size}
            loadUrl={loadReaderUrl}
            onBack={() => navigate(accessToken ? '/dashboard' : '/')}
            onStandardPreview={() => setMode('preview')}
            onDownload={handleDownload}
          />
        )}
      </>
    );
  }

  const fileIconType = resolveFileIconType(file.mime_type, file.extension);

  return (
    <div className={cn(expanded ? 'flex min-h-0 flex-1 flex-col' : 'space-y-6')}>
      <SEOHead
        title={ogTitle}
        description={ogDescription}
        ogImage={ogImage}
        canonical={`https://shared-space.ru/share/${token}`}
      />
      <div hidden={expanded}>
        <Link
          to={accessToken ? '/dashboard' : '/'}
          className="inline-flex items-center gap-2 text-sm text-theme-secondary hover:text-theme-primary transition-colors"
        >
          <ArrowLeft size={16} />
          SharedSpace
        </Link>
      </div>
      <div
        className={cn(expanded ? 'flex min-h-0 flex-1' : 'grid grid-cols-1 gap-6 lg:grid-cols-3')}
      >
        <div className={cn('min-w-0', expanded ? 'flex min-h-0 flex-1 flex-col' : 'lg:col-span-2')}>
          <div
            className={cn(
              'bg-theme-secondary',
              expanded
                ? 'flex min-h-0 flex-1 flex-col'
                : 'rounded-theme border border-theme p-4 shadow-theme-card',
            )}
          >
            <div
              className={cn(
                'flex shrink-0 items-center justify-between gap-3',
                expanded ? 'border-b border-theme px-3 py-2 sm:px-4' : 'mb-3',
              )}
            >
              <h2 className="min-w-0 truncate text-sm font-medium text-theme-secondary">
                {expanded ? file.filename : 'Предпросмотр'}
              </h2>
              <div className="flex shrink-0 items-center gap-2">
                {(mobileDocx || mobileOffice) && (
                  <Button
                    type="button"
                    variant="secondary"
                    aria-label="Режим чтения"
                    className="inline-grid size-9 shrink-0 place-items-center p-0"
                    title="Режим чтения"
                    onClick={() => setMode('reader')}
                  >
                    <BookOpen size={16} aria-hidden="true" />
                  </Button>
                )}
                {previewType === 'office' && (
                  <Button
                    type="button"
                    variant="secondary"
                    aria-controls={previewId}
                    aria-expanded={expanded}
                    aria-label={expanded ? 'Свернуть предпросмотр' : 'Развернуть предпросмотр'}
                    title={expanded ? 'Свернуть предпросмотр' : 'Развернуть предпросмотр'}
                    className="inline-grid size-9 shrink-0 place-items-center p-0"
                    onClick={() => setMode(expanded ? 'preview' : 'expanded')}
                  >
                    {expanded ? (
                      <Minimize size={16} aria-hidden="true" />
                    ) : (
                      <Maximize size={16} aria-hidden="true" />
                    )}
                  </Button>
                )}
                <button
                  onClick={handleDownload}
                  aria-label="Скачать файл"
                  title="Скачать файл"
                  className="group inline-flex h-9 w-9 items-center justify-center gap-2 rounded-theme border border-brand/30 bg-brand-light text-brand transition-colors hover:bg-brand hover:text-theme-on-brand sm:w-auto sm:px-3 sm:text-sm sm:font-medium"
                >
                  <Download
                    size={16}
                    className="group-hover:[animation:ss-bounce-up_0.4s_ease-in-out]"
                  />
                  <span className="hidden sm:inline">Скачать</span>
                </button>
              </div>
            </div>
            {renderPreview()}
          </div>
        </div>

        <div className={expanded ? 'hidden' : 'space-y-4'}>
          <div className="bg-theme-secondary border border-theme rounded-theme p-5 shadow-theme-card">
            <h3 className="font-medium text-theme-primary mb-3">Информация о файле</h3>

            <button
              onClick={handleCopyFilename}
              className="group flex items-center gap-3 p-3 bg-theme-tertiary hover:bg-theme-hover rounded-theme border border-theme transition-colors w-full text-left"
            >
              <div className="p-2 bg-theme-secondary rounded-theme shadow-theme-card shrink-0 group-hover:text-brand transition-colors">
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
        </div>
      </div>
    </div>
  );
};

export default SharePage;
