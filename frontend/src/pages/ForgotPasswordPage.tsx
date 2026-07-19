import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MailCheck } from 'lucide-react';
import SEOHead from '../components/SEOHead';
import { requestPasswordReset } from '../api/auth';
import { ApiError } from '../api/client';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const validate = (): boolean => {
    const trimmed = email.trim();
    if (!trimmed) {
      setFieldError('Введите email');
      return false;
    }
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
      setFieldError('Некорректный формат email');
      return false;
    }
    setFieldError('');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      // Всегда показываем одно и то же сообщение — бэкенд молча игнорирует
      // несуществующие/неподтверждённые адреса, чтобы не сливать их наличие.
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setFieldError('Слишком много запросов. Попробуйте через минуту.');
      } else if (err instanceof ApiError) {
        setFieldError(err.message);
      } else {
        setFieldError('Не удалось отправить письмо. Попробуйте позже.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-full px-4">
      <SEOHead
        title="Восстановление пароля"
        description="Сбросьте пароль от аккаунта SharedSpace, если вы его забыли."
      />
      <Card className="w-full max-w-md">
        {submitted ? (
          <div className="flex flex-col items-center text-center py-4">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-light text-brand">
              <MailCheck size={28} />
            </div>
            <h2 className="text-xl font-semibold text-theme-primary mb-2">Проверьте почту</h2>
            <p className="text-theme-secondary text-sm leading-relaxed mb-6">
              Если аккаунт с адресом <span className="font-medium text-theme-primary">{email}</span>{' '}
              существует и подтверждён, мы отправили письмо со ссылкой для сброса пароля. Ссылка
              действительна 1 час.
            </p>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-brand hover:text-brand-hover font-medium text-sm"
            >
              <ArrowLeft size={16} /> Вернуться к входу
            </Link>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-theme-primary mb-2 text-center">
              Восстановление пароля
            </h2>
            <p className="text-theme-secondary text-sm text-center mb-4">
              Введите email вашего аккаунта — мы отправим ссылку для сброса пароля.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-2" noValidate>
              <div>
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-theme-md border border-theme bg-theme-primary text-theme-primary outline-none focus:border-brand"
                  autoComplete="email"
                />
                <p className="min-h-5 pt-1 pl-3 text-sm leading-4 text-danger">
                  {fieldError || '\u00A0'}
                </p>
              </div>

              <Button type="submit" disabled={isSubmitting} className="mt-1 w-full">
                {isSubmitting ? 'Отправка...' : 'Отправить ссылку'}
              </Button>
            </form>
            <p className="mt-4 text-center text-theme-secondary text-sm">
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-brand hover:text-brand-hover font-medium"
              >
                <ArrowLeft size={16} /> Назад к входу
              </Link>
            </p>
          </>
        )}
      </Card>
    </div>
  );
};

export default ForgotPasswordPage;
