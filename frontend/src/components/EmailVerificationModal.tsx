import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Mail, RefreshCw, LogOut } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useAuth } from '../hooks/useAuth';
import { useToastStore } from '../hooks/useToast';

const RESEND_COOLDOWN_SECONDS = 60;

/**
 * EmailVerificationModal is a non-dismissable modal shown to authenticated
 * users who haven't yet confirmed their email. It blocks the entire UI
 * (Escape key, backdrop click, and close button are all disabled).
 *
 * The user has two options:
 *   - "Отправить письмо повторно" — issues a new verify-email token and
 *     emails it. Rate-limited client-side to one resend per 60 seconds
 *     (the backend has its own IP-based limiter as a backstop).
 *   - "Выйти" — logs the user out so they can come back later.
 */
const EmailVerificationModal: React.FC = () => {
  const { isAuthenticated, isActivated, user, resendVerification, logout } = useAuth();
  const showToast = useToastStore((s) => s.showToast);
  const location = useLocation();

  const isOpen = isAuthenticated && !isActivated && !location.pathname.startsWith('/verify-email/');
  const [isSending, setIsSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Client-side cooldown — prevents the user from spamming the resend
  // button faster than the backend IP-limiter would allow. Persists
  // across modal open/close cycles within a single session.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Reset cooldown when the modal becomes visible (matches the moment
  // we know a fresh email was just sent during registration).
  useEffect(() => {
    if (isOpen) {
      setCooldown(0);
    }
  }, [isOpen]);

  const handleResend = async () => {
    if (cooldown > 0 || isSending) return;
    setIsSending(true);
    try {
      await resendVerification();
      setCooldown(RESEND_COOLDOWN_SECONDS);
      showToast('Письмо подтверждения отправлено', 'success');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Не удалось отправить письмо. Попробуйте позже.';
      showToast(message, 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // ignore — store is cleared regardless
    }
  };

  // The modal is non-dismissable: onClose is a no-op.
  const noop = () => undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={noop}
      title="Подтвердите почту"
      showCloseButton={false}
      maxWidth="md"
    >
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-light text-brand">
          <Mail size={32} />
        </div>

        <p className="text-theme-secondary text-sm leading-relaxed mb-1">
          На адрес
          {user?.email && (
            <>
              {' '}
              <span className="font-medium text-theme-primary break-all">{user.email}</span>
            </>
          )}{' '}
          отправлено письмо со ссылкой для подтверждения.
        </p>
        <p className="text-theme-muted text-xs leading-relaxed mb-6">
          Проверьте входящие и папку «Спам». Ссылка действительна 24 часа.
        </p>

        <div className="flex flex-col gap-2 w-full">
          <Button onClick={handleResend} disabled={isSending || cooldown > 0} className="w-full">
            {isSending ? (
              <>
                <RefreshCw size={16} className="animate-spin mr-1.5 inline" />
                Отправка...
              </>
            ) : cooldown > 0 ? (
              `Отправить ещё раз через ${cooldown}с`
            ) : (
              'Отправить письмо повторно'
            )}
          </Button>

          <Button onClick={handleLogout} variant="ghost" className="w-full text-theme-secondary">
            <LogOut size={16} className="mr-1.5 inline" />
            Выйти
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default EmailVerificationModal;
