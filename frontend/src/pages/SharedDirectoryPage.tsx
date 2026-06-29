import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Folder,
  Download,
  KeyRound,
  Eye,
  EyeOff,
  Home,
  ChevronRight,
} from 'lucide-react';
import {
  resolveDirectoryShareLink,
  DirectoryShareLinkResolveResult,
  DirectoryShareLinkFile,
} from '../api/sharelinks';
import { useAuthStore } from '../store/authStore';
import { FileIcon } from '../components/ui/FileIcon';
import { ViewToggle, ViewMode } from '../components/ui/ViewToggle';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
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

interface Breadcrumb {
  id: string;
  name: string;
}

function parsePath(path: string): string[] {
  if (!path) return [];
  return path.split(',').filter(Boolean);
}

function encodePath(ids: string[]): string {
  return ids.join(',');
}

const SharedDirectoryPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const accessToken = useAuthStore((state) => state.accessToken);

  const pathParam = searchParams.get('path') || '';
  const pathIds = parsePath(pathParam);
  const subDirId = pathIds.length > 0 ? pathIds[pathIds.length - 1] : '';
  const previewFileId = searchParams.get('file') || '';

  const [data, setData] = useState<DirectoryShareLinkResolveResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);

  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [savedPassword, setSavedPassword] = useState<string>('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('sharedDirViewMode') as ViewMode) || 'grid';
  });

  const fetchData = useCallback(
    async (pw?: string) => {
      if (!token) return;
      const activePassword = pw !== undefined ? pw : savedPassword;
      setIsLoading(true);
      setError(null);
      try {
        const result = await resolveDirectoryShareLink(
          token,
          subDirId || undefined,
          accessToken,
          activePassword,
        );
        setData(result);
        setNeedsPassword(false);

        // Update breadcrumbs with the current directory name from API response
        setBreadcrumbs((prev) => {
          const updated = [...prev];
          if (updated.length === 0) {
            updated.push({ id: '', name: result.name });
          } else {
            updated[updated.length - 1] = { id: subDirId, name: result.name };
          }
          return updated;
        });
      } catch (err: any) {
        if (err?.status === 404) {
          setError('Ссылка не найдена или истёк срок действия');
        } else if (err?.status === 401) {
          setError('Для доступа необходимо войти в аккаунт');
        } else if (err?.status === 403) {
          if (pw === undefined && !savedPassword) {
            setNeedsPassword(true);
          } else {
            setPasswordError('Неверный пароль');
          }
        } else {
          setError(err?.message || 'Не удалось загрузить содержимое');
        }
      } finally {
        setIsLoading(false);
        setIsNavigating(false);
      }
    },
    [token, subDirId, accessToken, savedPassword],
  );

  useEffect(() => {
    setNeedsPassword(false);
    setPassword('');
    setPasswordError(null);
    setIframeError(false);
    if (!savedPassword) {
      setData(null);
    }
    fetchData();
  }, [fetchData]);

  const handlePasswordSubmit = async () => {
    if (!token || !password) return;
    setIsSubmittingPassword(true);
    setPasswordError(null);
    setSavedPassword(password);
    await fetchData(password);
    setIsSubmittingPassword(false);
  };

  const handleNavigate = (dirId: string) => {
    setIsNavigating(true);
    const newPathIds = [...pathIds, dirId];
    setSearchParams({ path: encodePath(newPathIds) });
    // Add pending breadcrumb entry (name will be filled by API)
    setBreadcrumbs((prev) => [...prev, { id: dirId, name: '...' }]);
  };

  const handleBreadcrumbClick = (index: number) => {
    if (index === breadcrumbs.length - 1) return;
    setIsNavigating(true);
    const newPathIds = pathIds.slice(0, index);
    setSearchParams(newPathIds.length > 0 ? { path: encodePath(newPathIds) } : {});
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
  };

  const handleGoBack = () => {
    if (previewFileId) {
      setSearchParams(pathParam ? { path: pathParam } : {});
      setIframeError(false);
    }
  };

  const handleFileClick = (file: DirectoryShareLinkFile) => {
    setIframeError(false);
    setSearchParams({ ...(pathParam ? { path: pathParam } : {}), file: file.id });
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('sharedDirViewMode', mode);
  };

  const handleDownload = useCallback(async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 100);
    } catch {
      window.open(url, '_blank');
    }
  }, []);

  const previewFile =
    previewFileId && data ? data.files.find((f) => f.id === previewFileId) || null : null;

  if (needsPassword && !data) {
    return (
      <div className="flex items-center justify-center min-h-[80vh] px-4">
        <Card className="w-full max-w-md">
          <div className="text-center space-y-1 mb-6">
            <div className="w-12 h-12 mx-auto flex items-center justify-center bg-brand/10 rounded-full mb-3">
              <KeyRound size={22} className="text-brand" />
            </div>
            <h2 className="text-xl font-semibold text-theme-primary">
              Директория защищена паролем
            </h2>
            <p className="text-sm text-theme-muted">Введите пароль для доступа</p>
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
              {isSubmittingPassword ? 'Проверка...' : 'Открыть'}
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

  if (isLoading || isNavigating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-theme-primary">
        <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-theme-primary px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 mx-auto flex items-center justify-center bg-danger-light rounded-full">
            <FileIcon type="unknown" size={28} />
          </div>
          <h1 className="text-xl font-semibold text-theme-primary">Директория недоступна</h1>
          <p className="text-sm text-theme-secondary">{error || 'Директория не найдена'}</p>
          <Link
            to="/"
            className="inline-flex items-center px-4 py-2 bg-brand text-theme-on-brand hover:bg-brand-hover rounded-theme-md text-sm font-medium transition-colors"
          >
            На главную
          </Link>
        </div>
      </div>
    );
  }

  // File preview mode
  if (previewFile) {
    const previewType = determinePreviewType(previewFile.mime_type, previewFile.extension);
    const ext = previewFile.extension.replace(/^\./, '').toLowerCase();
    const canPreview = previewType !== 'unsupported' && !PROBLEMATIC_EXTENSIONS.has(ext);
    const fileIconType = resolveFileIconType(previewFile.mime_type, previewFile.extension);

    const renderPreview = () => {
      if (!canPreview || iframeError) {
        return (
          <div className="bg-theme-tertiary rounded-theme-lg py-16 flex flex-col items-center gap-4 text-theme-muted group">
            <EyeOff
              size={64}
              className="text-theme-muted group-hover:text-brand transition-colors"
            />
            <p className="text-base font-medium">Просмотр недоступен</p>
            <p className="text-sm">Файл не может быть отображён в браузере</p>
            <button
              onClick={() => handleDownload(previewFile.url, previewFile.filename)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-brand text-theme-on-brand hover:bg-brand-hover rounded-theme-md transition-colors text-sm font-medium"
            >
              <Download size={16} />
              Скачать файл
            </button>
          </div>
        );
      }
      switch (previewType) {
        case 'image':
          return (
            <div className="flex items-center justify-center bg-theme-tertiary rounded-theme-lg overflow-hidden min-h-[400px]">
              <img
                src={previewFile.url}
                alt={previewFile.filename}
                className="max-w-full max-h-[70vh] object-contain"
                onError={() => setIframeError(true)}
              />
            </div>
          );
        case 'video':
          return (
            <div className="bg-theme-tertiary rounded-theme-lg overflow-hidden">
              <video
                src={previewFile.url}
                controls
                className="w-full max-h-[70vh]"
                onError={() => setIframeError(true)}
              />
            </div>
          );
        case 'audio':
          return (
            <div className="bg-theme-tertiary rounded-theme-lg p-8">
              <div className="flex flex-col items-center gap-6 group">
                <div className="w-24 h-24 rounded-full bg-brand-light flex items-center justify-center text-brand group-hover:text-brand-hover transition-colors">
                  <FileIcon type="audio" size={40} />
                </div>
                <p className="text-lg font-medium text-theme-primary">{previewFile.filename}</p>
                <audio
                  src={previewFile.url}
                  controls
                  className="w-full max-w-md"
                  onError={() => setIframeError(true)}
                />
              </div>
            </div>
          );
        case 'pdf':
          return (
            <div className="bg-theme-tertiary rounded-theme-lg overflow-hidden min-h-[500px]">
              <object
                data={previewFile.url}
                type="application/pdf"
                className="w-full h-[70vh]"
                onError={() => setIframeError(true)}
              >
                <div className="flex flex-col items-center gap-4 py-12 text-theme-muted">
                  <FileIcon type="pdf" size={48} />
                  <p>Не удалось загрузить PDF</p>
                </div>
              </object>
            </div>
          );
        case 'text':
        case 'code':
          return (
            <div className="bg-theme-tertiary rounded-theme-lg overflow-hidden min-h-[400px]">
              <iframe
                ref={iframeRef}
                src={previewFile.url}
                className="w-full h-[70vh]"
                title={previewFile.filename}
                sandbox="allow-scripts allow-same-origin"
                onError={() => setIframeError(true)}
              />
            </div>
          );
        default:
          return null;
      }
    };

    return (
      <div className="space-y-6 pb-10">
        <div>
          <button
            onClick={handleGoBack}
            className="inline-flex items-center gap-2 text-sm text-theme-secondary hover:text-theme-primary transition-colors"
          >
            <ArrowLeft size={16} />
            Вернуться в {data.name}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-theme-secondary border border-theme rounded-theme-lg p-4 shadow-theme-card">
              <h2 className="text-sm font-medium text-theme-secondary mb-3">Предпросмотр</h2>
              {renderPreview()}
            </div>
          </div>
          <div className="space-y-4">
            <div className="bg-theme-secondary border border-theme rounded-theme-lg p-5 shadow-theme-card">
              <h3 className="font-medium text-theme-primary mb-3">Информация о файле</h3>
              <div className="flex items-center gap-3 p-3 bg-theme-tertiary rounded-theme-md border border-theme">
                <div className="p-2 bg-theme-secondary rounded-theme-sm shadow-theme-card shrink-0">
                  <FileIcon type={fileIconType} size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-theme-primary font-medium truncate">
                    {previewFile.filename}
                  </p>
                  <p className="text-xs text-theme-muted">Файл</p>
                </div>
              </div>
              <div className="my-4 border-t border-theme" />
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-theme-secondary">Тип</span>
                  <span className="text-theme-primary font-medium">
                    {getFileTypeDisplay(previewFile.mime_type, previewFile.extension)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-theme-secondary">Размер</span>
                  <span className="text-theme-primary font-medium">
                    {formatFileSize(previewFile.size)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-theme-secondary">Владелец</span>
                  <span className="text-theme-primary font-medium">{data.owner_username}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-theme-secondary">Создан</span>
                  <span className="text-theme-primary font-medium">
                    {formatDate(previewFile.created_at)}
                  </span>
                </div>
              </div>
            </div>
            <div className="bg-theme-secondary border border-theme rounded-theme-lg p-5 shadow-theme-card">
              <h3 className="font-medium text-theme-primary mb-3">Действия</h3>
              <button
                onClick={() => handleDownload(previewFile.url, previewFile.filename)}
                className="group w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-brand text-theme-on-brand hover:bg-brand-hover rounded-theme-md transition-colors text-sm font-medium"
              >
                <Download size={16} />
                Скачать
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Directory listing mode
  const crumbs = breadcrumbs.length > 0 ? breadcrumbs : data ? [{ id: '', name: data.name }] : [];

  return (
    <div className="space-y-6 pb-10">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 text-sm flex-wrap">
        <Link
          to={accessToken ? '/dashboard' : '/'}
          className="text-theme-secondary hover:text-theme-primary transition-colors shrink-0"
        >
          <Home size={14} />
        </Link>
        <ChevronRight size={12} className="text-theme-muted shrink-0" />
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          const isRoot = crumb.id === '';
          return (
            <React.Fragment key={i}>
              {isLast ? (
                <span className="text-theme-primary font-medium truncate max-w-[200px]">
                  {crumb.name}
                </span>
              ) : (
                <button
                  onClick={() => handleBreadcrumbClick(i)}
                  className="text-theme-secondary hover:text-theme-primary transition-colors truncate max-w-[150px]"
                >
                  {crumb.name}
                </button>
              )}
              {!isLast && <ChevronRight size={12} className="text-theme-muted shrink-0" />}
            </React.Fragment>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          {(data.subdirectories.length > 0 || data.files.length > 0) && (
            <ViewToggle viewMode={viewMode} onViewModeChange={handleViewModeChange} />
          )}
        </div>
      </div>

      {/* Empty state */}
      {data.subdirectories.length === 0 && data.files.length === 0 && (
        <div className="text-center py-16 text-theme-muted">
          <Folder size={48} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Директория пуста</p>
        </div>
      )}

      {/* Subdirectories */}
      {data.subdirectories.length > 0 && (
        <div className="bg-theme-secondary border border-theme rounded-theme-lg p-4 shadow-theme-card">
          <h2 className="text-sm font-medium text-theme-secondary mb-3">Папки</h2>

          {/* Grid view */}
          <div className={viewMode === 'grid' ? '' : 'hidden'}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {data.subdirectories.map((subdir) => (
                <button
                  key={subdir.id}
                  onClick={() => handleNavigate(subdir.id)}
                  className="group flex flex-col items-center p-3 rounded-theme-md transition-colors cursor-pointer bg-theme-tertiary hover:bg-theme-hover border border-theme"
                >
                  <div className="w-16 h-16 flex items-center justify-center text-theme-muted group-hover:text-brand transition-colors">
                    <Folder size={40} strokeWidth={1.5} />
                  </div>
                  <p className="text-sm text-theme-primary font-medium text-center mt-2 truncate w-full max-w-[120px]">
                    {subdir.name}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* List view */}
          <div className={viewMode === 'list' ? '' : 'hidden'}>
            <div className="space-y-1">
              {data.subdirectories.map((subdir) => (
                <button
                  key={subdir.id}
                  onClick={() => handleNavigate(subdir.id)}
                  className="group flex items-center gap-3 w-full p-3 rounded-theme-md transition-colors cursor-pointer bg-theme-tertiary hover:bg-theme-hover border border-theme text-left"
                >
                  <div className="p-2 bg-theme-secondary rounded-theme-sm shrink-0">
                    <Folder
                      size={20}
                      className="text-theme-muted group-hover:text-brand transition-colors"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-theme-primary font-medium truncate">{subdir.name}</p>
                    <p className="text-xs text-theme-muted">Папка</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Files */}
      {data.files.length > 0 && (
        <div className="bg-theme-secondary border border-theme rounded-theme-lg p-4 shadow-theme-card">
          <h2 className="text-sm font-medium text-theme-secondary mb-3">Файлы</h2>

          {/* Grid view */}
          <div className={viewMode === 'grid' ? '' : 'hidden'}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {data.files.map((file) => {
                const iconType = resolveFileIconType(file.mime_type, file.extension);
                return (
                  <button
                    key={file.id}
                    onClick={() => handleFileClick(file)}
                    className="group flex flex-col items-center p-3 rounded-theme-md transition-colors cursor-pointer bg-theme-tertiary hover:bg-theme-hover border border-theme"
                  >
                    <div className="w-16 h-16 flex items-center justify-center transition-colors">
                      <FileIcon
                        type={iconType}
                        size={40}
                        className="group-hover:text-brand transition-colors"
                      />
                    </div>
                    <p className="text-sm text-theme-primary font-medium text-center mt-2 truncate w-full max-w-[120px]">
                      {file.filename}
                    </p>
                    <p className="text-xs text-theme-muted mt-0.5">{formatFileSize(file.size)}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* List view */}
          <div className={viewMode === 'list' ? '' : 'hidden'}>
            <div className="space-y-1">
              {data.files.map((file) => {
                const iconType = resolveFileIconType(file.mime_type, file.extension);
                return (
                  <button
                    key={file.id}
                    onClick={() => handleFileClick(file)}
                    className="group flex items-center gap-3 w-full p-3 rounded-theme-md transition-colors cursor-pointer bg-theme-tertiary hover:bg-theme-hover border border-theme text-left"
                  >
                    <div className="p-2 bg-theme-secondary rounded-theme-sm shrink-0">
                      <FileIcon
                        type={iconType}
                        size={20}
                        className="text-theme-muted group-hover:text-brand transition-colors"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-theme-primary font-medium truncate">
                        {file.filename}
                      </p>
                      <p className="text-xs text-theme-muted">{formatFileSize(file.size)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SharedDirectoryPage;
