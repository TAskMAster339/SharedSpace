import React, { useEffect, useRef, useState } from 'react';
import { Globe, Lock, KeyRound, Eye, EyeOff, AlertCircle, Link2, Copy, Check } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { ShareLink, ShareLinkAccess, updateShareLink } from '../../api/sharelinks';
import { useToastStore } from '../../hooks/useToast';
import { cn } from '../../utils/cn';

interface EditShareLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  link: ShareLink | null;
  accessToken: string;
  onSaved: (updated: ShareLink) => void;
}

const SHARE_BASE_URL =
  typeof window !== 'undefined'
    ? `${window.location.origin}/share`
    : process.env.REACT_APP_SHARE_BASE_URL || 'http://localhost:3000/share';

const EXPIRY_OPTIONS = [
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

function expiryToOption(expiresAt: string | null): string {
  if (!expiresAt) return '30d';
  const target = new Date(expiresAt).getTime();
  const now = Date.now();
  const diff = target - now;
  if (diff <= 0) return '1h';

  const map: [string, number][] = [
    ['1h', 60 * 60 * 1000],
    ['24h', 24 * 60 * 60 * 1000],
    ['7d', 7 * 24 * 60 * 60 * 1000],
    ['30d', 30 * 24 * 60 * 60 * 1000],
  ];

  let best = '30d';
  let bestDiff = Infinity;
  for (const [value, ms] of map) {
    const d = Math.abs(diff - ms);
    if (d < bestDiff) {
      bestDiff = d;
      best = value;
    }
  }
  return best;
}

export const EditShareLinkModal: React.FC<EditShareLinkModalProps> = ({
  isOpen,
  onClose,
  link,
  accessToken,
  onSaved,
}) => {
  const [access, setAccess] = useState<ShareLinkAccess>('public');
  const [expiry, setExpiry] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [clearPassword, setClearPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);

  const showToast = useToastStore((s) => s.showToast);
  const isCopying = useRef(false);

  useEffect(() => {
    if (isOpen && link) {
      setAccess(link.access_type);
      setExpiry(expiryToOption(link.expires_at));
      setPassword('');
      setShowPassword(false);
      setClearPassword(false);
      setError(null);
    }
  }, [isOpen, link]);

  const handleSave = async () => {
    if (!link) return;
    setIsSaving(true);
    setError(null);
    try {
      let passwordValue: string | undefined | null;
      if (clearPassword) {
        passwordValue = '';
      } else if (password) {
        passwordValue = password;
      } else {
        passwordValue = undefined;
      }

      const updated = await updateShareLink(accessToken, link.id, {
        access_type: access,
        expires_at: expiryToDate(expiry),
        password: passwordValue,
      });
      onSaved(updated);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Не удалось обновить ссылку');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyUrl = async () => {
    if (!link || isCopying.current) return;
    isCopying.current = true;
    const url = `${SHARE_BASE_URL}/${link.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setUrlCopied(true);
      showToast('Ссылка скопирована в буфер обмена');
      setTimeout(() => {
        setUrlCopied(false);
        isCopying.current = false;
      }, 5000);
    } catch {
      isCopying.current = false;
    }
  };

  if (!link) return null;

  const hasPassword = link.has_password;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Изменить ссылку" maxWidth="lg">
      <div className="space-y-4">
        {/* Ссылка */}
        {link && (
          <div className="space-y-1">
            <label className="text-xs text-theme-secondary font-medium">Ссылка</label>
            <button
              type="button"
              onClick={handleCopyUrl}
              className="w-full flex items-center gap-2 p-2.5 rounded-theme-md border border-theme bg-theme-secondary text-left hover:border-brand hover:bg-brand-light transition-colors group"
            >
              <Link2
                size={14}
                className="shrink-0 text-theme-muted group-hover:text-brand transition-colors"
              />
              <span className="flex-1 text-xs text-theme-muted group-hover:text-theme-primary truncate">
                {SHARE_BASE_URL}/{link.token}
              </span>
              {urlCopied ? (
                <Check size={14} className="shrink-0 text-green-500" />
              ) : (
                <Copy
                  size={14}
                  className="shrink-0 text-theme-muted group-hover:text-brand transition-colors"
                />
              )}
            </button>
          </div>
        )}

        {/* Тип доступа */}
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
        </div>

        {/* Срок действия */}
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

        {/* Пароль */}
        <div className="space-y-2">
          <label className="text-xs text-theme-secondary font-medium">Пароль (необязательно)</label>

          {hasPassword && (
            <div className="flex items-center gap-2 p-2.5 rounded-theme-md bg-theme-tertiary border border-theme">
              <KeyRound size={14} className="text-theme-muted shrink-0" />
              <span className="text-xs text-theme-secondary flex-1">Пароль установлен</span>
              <button
                type="button"
                onClick={() => setClearPassword(!clearPassword)}
                className={cn(
                  'text-xs font-medium px-2 py-1 rounded-theme-sm border transition-colors',
                  clearPassword
                    ? 'border-danger text-danger bg-danger-light'
                    : 'border-theme text-theme-secondary hover:text-danger hover:border-danger',
                )}
              >
                {clearPassword ? 'Не удалять' : 'Удалить'}
              </button>
            </div>
          )}

          <div className="relative group">
            <KeyRound
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted group-hover:text-brand transition-colors"
            />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                hasPassword
                  ? 'Новый пароль (оставьте пустым, чтобы не менять)'
                  : 'Оставьте пустым, если не нужен'
              }
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

        {/* Ошибка */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-danger-light border border-danger/20 rounded-theme-md text-sm text-danger">
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </div>
        )}

        {/* Кнопки */}
        <div className="flex gap-2 pt-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            className="flex-1 border border-theme"
          >
            Отмена
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1"
          >
            {isSaving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
