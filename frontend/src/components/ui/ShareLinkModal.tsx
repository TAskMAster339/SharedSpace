import React, { useEffect, useState, useCallback } from 'react';
import {
  Link2,
  Globe,
  Lock,
  Trash2,
  Copy,
  Check,
  Plus,
  Clock,
  AlertCircle,
  KeyRound,
  Eye,
  EyeOff,
  Folder,
} from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { EditShareLinkModal } from './EditShareLinkModal';
import { useToastStore } from '../../hooks/useToast';
import {
  ShareLink,
  ShareLinkAccess,
  createShareLink,
  listShareLinks,
  deleteShareLink,
  createDirectoryShareLink,
  listDirectoryShareLinks,
} from '../../api/sharelinks';
import { cn } from '../../utils/cn';
import { useAuthStore } from '../../store/authStore';

interface ShareLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemId: string;
  itemName: string;
  itemType: 'file' | 'directory';
  accessToken: string;
  onLinksChanged?: (hasLinks: boolean) => void;
  onLinkDeleted?: (info: { accessType: ShareLinkAccess; expiresAt: string | null }) => void;
  refreshKey?: number;
}

const FILE_SHARE_BASE_URL =
  typeof window !== 'undefined' ? `${window.location.origin}/share` : 'http://localhost:3000/share';

const DIR_SHARE_BASE_URL =
  typeof window !== 'undefined'
    ? `${window.location.origin}/share/dir`
    : 'http://localhost:3000/share/dir';

const EXPIRY_OPTIONS = [
  { label: 'Не истекает', value: '' },
  { label: '1 час', value: '1h' },
  { label: '24 часа', value: '24h' },
  { label: '7 дней', value: '7d' },
  { label: '30 дней', value: '30d' },
];

function expiryToDate(value: string): string | null {
  if (!value) return null;
  const now = new Date();
  const map: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  return new Date(now.getTime() + (map[value] ?? 0)).toISOString();
}

function formatExpiry(dateStr: string | null): string {
  if (!dateStr) return 'Не истекает';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  if (diff <= 0) return 'Истекла';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 24) return `Истекает через ${hours} ч.`;
  const days = Math.floor(hours / 24);
  return `Истекает через ${days} дн.`;
}

function isExpired(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() < Date.now();
}

export const ShareLinkModal: React.FC<ShareLinkModalProps> = ({
  isOpen,
  onClose,
  itemId,
  itemName,
  itemType,
  accessToken,
  onLinksChanged,
  onLinkDeleted,
  refreshKey,
}) => {
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const shareLinksUsed = useAuthStore((s) => s.user?.share_links_count ?? 0);
  const shareLinksQuota = useAuthStore((s) => s.user?.share_links_quota ?? 0);
  const atLinksLimit = shareLinksQuota > 0 && shareLinksUsed >= shareLinksQuota;
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [access, setAccess] = useState<ShareLinkAccess>('public');
  const [expiry, setExpiry] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [editingLink, setEditingLink] = useState<ShareLink | null>(null);

  const showToast = useToastStore((s) => s.showToast);

  const isFile = itemType === 'file';
  const shareBaseUrl = isFile ? FILE_SHARE_BASE_URL : DIR_SHARE_BASE_URL;

  const loadLinks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = isFile
        ? await listShareLinks(accessToken, itemId)
        : await listDirectoryShareLinks(accessToken, itemId);
      setLinks(data ?? []);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить ссылки');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, itemId, isFile]);

  useEffect(() => {
    if (isOpen) {
      loadLinks();
      setShowCreateForm(false);
      setAccess('public');
      setExpiry('');
      setPassword('');
      setShowPassword(false);
    }
  }, [isOpen, loadLinks, refreshKey]);

  const handleCreate = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const body = {
        access_type: access,
        expires_at: expiryToDate(expiry),
        password: password || undefined,
      };
      const newLink = isFile
        ? await createShareLink(accessToken, itemId, body)
        : await createDirectoryShareLink(accessToken, itemId, body);
      const wasEmpty = links.length === 0;
      setLinks((prev) => [newLink, ...prev]);
      refreshUser();
      if (wasEmpty) {
        onLinksChanged?.(true);
      }
      const url = `${shareBaseUrl}/${newLink.token}`;
      await navigator.clipboard.writeText(url);
      showToast('Ссылка создана и скопирована');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Не удалось создать ссылку');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, link: ShareLink) => {
    e.stopPropagation();
    const wasLast = links.length === 1;
    try {
      await deleteShareLink(accessToken, link.id);
      setLinks((prev) => prev.filter((l) => l.id !== link.id));
      refreshUser();
      if (wasLast) {
        onLinksChanged?.(false);
      }
      onLinkDeleted?.({ accessType: link.access_type, expiresAt: link.expires_at });
    } catch (err: any) {
      setError(err?.message || 'Не удалось удалить ссылку');
    }
  };

  const handleCopy = async (e: React.MouseEvent, link: ShareLink) => {
    e.stopPropagation();
    const url = `${shareBaseUrl}/${link.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(link.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // fallback
    }
  };

  const handleEditLink = (link: ShareLink) => {
    setEditingLink(link);
  };

  const handleEditSaved = (updated: ShareLink) => {
    setLinks((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ссылки общего доступа" maxWidth="lg">
      <div className="flex items-center gap-2 mb-5 p-3 bg-theme-tertiary rounded-theme-md border border-theme">
        {isFile ? (
          <Link2 size={16} className="text-theme-muted shrink-0" />
        ) : (
          <Folder size={16} className="text-theme-muted shrink-0" />
        )}
        <span className="text-sm text-theme-primary font-medium truncate">{itemName}</span>
        <span className="text-xs text-theme-muted shrink-0">{isFile ? 'Файл' : 'Папка'}</span>
      </div>

      {!showCreateForm &&
        (atLinksLimit ? (
          <div className="mb-5 px-4 py-2.5 rounded-theme-md bg-danger-light text-danger text-xs text-center">
            Достигнут лимит ссылок ({shareLinksUsed}/{shareLinksQuota})
          </div>
        ) : (
          <button
            onClick={() => setShowCreateForm(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-theme hover:border-brand hover:text-brand rounded-theme-md text-sm text-theme-secondary transition-colors mb-5"
          >
            <Plus size={16} />
            Создать новую ссылку
          </button>
        ))}

      {showCreateForm && (
        <div className="mb-5 p-4 bg-theme-tertiary border border-theme rounded-theme-md space-y-4">
          <p className="text-sm font-medium text-theme-primary">Новая ссылка</p>

          <div className="space-y-1">
            <label className="text-xs text-theme-secondary font-medium">Тип доступа</label>
            <div className="flex gap-2">
              <button
                onClick={() => setAccess('public')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-theme-md border text-sm transition-colors',
                  access === 'public'
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-theme bg-theme-secondary text-theme-secondary hover:border-brand hover:text-brand hover:bg-brand-light',
                )}
              >
                <Globe size={15} />
                Публичная
              </button>
              <button
                onClick={() => setAccess('authenticated')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-theme-md border text-sm transition-colors',
                  access === 'authenticated'
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-theme bg-theme-secondary text-theme-secondary hover:border-brand hover:text-brand hover:bg-brand-light',
                )}
              >
                <Lock size={15} />
                Для авторизованных
              </button>
            </div>
            <p className="text-xs text-theme-muted mt-1">
              {access === 'public'
                ? 'Доступно всем без авторизации'
                : 'Доступ только авторизованным пользователям'}
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-theme-secondary font-medium">Срок действия</label>
            <div className="flex flex-wrap gap-2">
              {EXPIRY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setExpiry(opt.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-theme-md border text-xs transition-colors',
                    expiry === opt.value
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-theme bg-theme-secondary text-theme-secondary hover:border-brand hover:text-brand hover:bg-brand-light',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-theme-secondary font-medium">
              Пароль (необязательно)
            </label>
            <div className="relative group">
              <KeyRound
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted group-hover:text-brand transition-colors"
              />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Оставьте пустым, если не нужен"
                autoComplete="new-password"
                className="w-full pl-9 pr-9 py-2 text-sm bg-theme-secondary border border-theme rounded-theme-md text-theme-primary placeholder:text-theme-muted focus:outline-none focus:border-brand transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted hover:text-brand transition-colors"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowCreateForm(false)}
              className="flex-1 border border-theme"
            >
              Отмена
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreate}
              disabled={isCreating || atLinksLimit}
              className="flex-1"
            >
              {isCreating ? 'Создание...' : 'Создать'}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 mb-4 p-3 bg-danger-light border border-danger/20 rounded-theme-md text-sm text-danger">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-3">
        {isLoading && (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && links.length === 0 && (
          <div className="text-center py-8 text-theme-muted text-sm">
            Ссылок ещё нет. Создайте первую.
          </div>
        )}

        {links.map((link) => {
          const expired = isExpired(link.expires_at);
          const url = `${shareBaseUrl}/${link.token}`;
          const isCopied = copiedId === link.id;

          return (
            <div
              key={link.id}
              onClick={() => handleEditLink(link)}
              className={cn(
                'flex items-start gap-3 p-3 rounded-theme-md border transition-colors cursor-pointer',
                expired
                  ? 'border-theme bg-theme-tertiary opacity-60'
                  : 'border-theme bg-theme-secondary hover:border-brand/30 hover:bg-brand-light',
              )}
            >
              <div
                className={cn(
                  'shrink-0 mt-0.5 p-1.5 rounded-theme-sm',
                  link.access_type === 'public' ? 'bg-green-500/10' : 'bg-theme-hover',
                )}
              >
                {link.access_type === 'public' ? (
                  <Globe size={14} className="text-green-500" />
                ) : (
                  <Lock size={14} className="text-theme-secondary" />
                )}
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-theme-primary">
                    {link.access_type === 'public' ? 'Публичная' : 'Для авторизованных'}
                  </span>
                  {link.has_password && (
                    <span className="inline-flex items-center gap-1 text-xs text-theme-muted bg-theme-hover px-1.5 py-0.5 rounded">
                      <KeyRound size={10} />
                      Пароль
                    </span>
                  )}
                  {expired && (
                    <span className="text-xs text-danger bg-danger-light px-1.5 py-0.5 rounded">
                      Истекла
                    </span>
                  )}
                </div>
                <p className="text-xs text-theme-muted truncate">{url}</p>
                <div className="flex items-center gap-1 text-xs text-theme-muted">
                  <Clock size={11} />
                  {formatExpiry(link.expires_at)}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {!expired && (
                  <button
                    onClick={(e) => handleCopy(e, link)}
                    title="Скопировать ссылку"
                    className="p-1.5 rounded-theme-sm hover:bg-theme-hover transition-colors group"
                  >
                    {isCopied ? (
                      <Check size={14} className="text-green-500" />
                    ) : (
                      <Copy
                        size={14}
                        className="text-theme-secondary group-hover:text-brand transition-colors"
                      />
                    )}
                  </button>
                )}
                <button
                  onClick={(e) => handleDelete(e, link)}
                  title="Удалить ссылку"
                  className="p-1.5 rounded-theme-sm hover:bg-danger-light text-theme-secondary hover:text-danger transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <EditShareLinkModal
        isOpen={editingLink !== null}
        onClose={() => setEditingLink(null)}
        link={editingLink}
        accessToken={accessToken}
        onSaved={handleEditSaved}
      />
    </Modal>
  );
};
