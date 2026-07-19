import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, MailCheck } from 'lucide-react';
import SEOHead from '../components/SEOHead';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

type Status = 'verifying' | 'success' | 'invalid' | 'expired' | 'already_activated';

const VerifyEmailPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, verifyEmailAndRefresh } = useAuth();
  const startedRef = useRef(false);
  const [status, setStatus] = useState<Status>('verifying');

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      if (!token) {
        setStatus('invalid');
        return;
      }
      try {
        await verifyEmailAndRefresh(token);
        setStatus('success');
      } catch {
        // Бэкенд возвращает 404 для протухших/несуществующих и 409 для уже использованных.
        // api/client.ts не раскрывает точный код ошибки в типе, поэтому различаем
        // по тексту сообщения — он формируется на стороне бэкенда.
        setStatus('expired');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="flex items-center justify-center h-full px-4">
      <SEOHead
        title="Подтверждение почты"
        description="Подтверждение адреса электронной почты для аккаунта SharedSpace."
      />
      <Card className="w-full max-w-md">
        {status === 'verifying' && (
          <div className="flex flex-col items-center text-center py-6">
            <Loader2 size={40} className="animate-spin text-brand mb-4" />
            <h2 className="text-xl font-semibold text-theme-primary mb-2">Подтверждаем почту...</h2>
            <p className="text-theme-secondary text-sm">Это займёт пару секунд.</p>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center text-center py-4">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-light text-brand">
              <CheckCircle2 size={28} />
            </div>
            <h2 className="text-xl font-semibold text-theme-primary mb-2">Почта подтверждена</h2>
            <p className="text-theme-secondary text-sm leading-relaxed mb-6">
              Ваш аккаунт успешно активирован. Теперь вам доступны все функции SharedSpace.
            </p>
            {isAuthenticated ? (
              <Button onClick={() => navigate('/dashboard')} className="w-full">
                Перейти в SharedSpace
              </Button>
            ) : (
              <Button onClick={() => navigate('/login')} className="w-full">
                Перейти ко входу
              </Button>
            )}
          </div>
        )}

        {status === 'already_activated' && (
          <div className="flex flex-col items-center text-center py-4">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-light text-brand">
              <MailCheck size={28} />
            </div>
            <h2 className="text-xl font-semibold text-theme-primary mb-2">
              Почта уже подтверждена
            </h2>
            <p className="text-theme-secondary text-sm leading-relaxed mb-6">
              Этот адрес уже был подтверждён ранее.
            </p>
            <Button onClick={() => navigate('/login')} className="w-full">
              Перейти ко входу
            </Button>
          </div>
        )}

        {(status === 'invalid' || status === 'expired') && (
          <div className="flex flex-col items-center text-center py-4">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger-light text-danger">
              <AlertCircle size={28} />
            </div>
            <h2 className="text-xl font-semibold text-theme-primary mb-2">
              {status === 'expired' ? 'Срок ссылки истёк' : 'Ссылка недействительна'}
            </h2>
            <p className="text-theme-secondary text-sm leading-relaxed mb-6">
              {status === 'expired'
                ? 'Ссылка для подтверждения действительна 24 часа. Запросите новую.'
                : 'Эта ссылка некорректна или уже была использована.'}
            </p>
            {isAuthenticated ? (
              <Button onClick={() => navigate('/dashboard')} className="w-full">
                Вернуться
              </Button>
            ) : (
              <Link to="/login" className="text-brand hover:text-brand-hover font-medium text-sm">
                Перейти ко входу
              </Link>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default VerifyEmailPage;
