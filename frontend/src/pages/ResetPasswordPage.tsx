import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import SEOHead from '../components/SEOHead';
import { resetPassword } from '../api/auth';
import { ApiError } from '../api/client';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

type Status = 'form' | 'success' | 'invalid' | 'expired';

const ResetPasswordPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>('form');

  const validate = (): boolean => {
    if (!password) {
      setFieldError('Введите новый пароль');
      return false;
    }
    if (password.length < 8) {
      setFieldError('Пароль должен быть не короче 8 символов');
      return false;
    }
    if (password.length > 72) {
      setFieldError('Пароль должен быть не длиннее 72 байт');
      return false;
    }
    let hasUpper = false,
      hasLower = false,
      hasSpecial = false;
    for (const ch of password) {
      if (/[A-ZА-Я]/.test(ch)) hasUpper = true;
      else if (/[a-zа-я]/.test(ch)) hasLower = true;
      else if (/[\p{P}\p{S}]/u.test(ch)) hasSpecial = true;
    }
    if (!hasUpper || !hasLower || !hasSpecial) {
      setFieldError('Пароль должен содержать заглавные, строчные буквы и спецсимволы');
      return false;
    }
    if (password !== confirmPassword) {
      setFieldError('Пароли не совпадают');
      return false;
    }
    setFieldError('');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setStatus('invalid');
      return;
    }
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await resetPassword(token, password);
      setStatus('success');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          setStatus('expired');
        } else if (err.status === 409) {
          setStatus('invalid');
        } else if (err.status === 429) {
          setFieldError('Слишком много запросов. Попробуйте через минуту.');
        } else if (err.code === 'validation' || err.status === 400) {
          setFieldError(err.message);
        } else {
          setFieldError('Не удалось сменить пароль. Попробуйте позже.');
        }
      } else {
        setFieldError('Не удалось сменить пароль. Попробуйте позже.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-full px-4">
      <SEOHead title="Новый пароль" description="Задайте новый пароль для аккаунта SharedSpace." />
      <Card className="w-full max-w-md">
        {status === 'success' ? (
          <div className="flex flex-col items-center text-center py-4">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-light text-brand">
              <CheckCircle2 size={28} />
            </div>
            <h2 className="text-xl font-semibold text-theme-primary mb-2">Пароль изменён</h2>
            <p className="text-theme-secondary text-sm leading-relaxed mb-6">
              Ваш пароль успешно обновлён. Все остальные устройства были разлогинены. Войдите с
              новым паролем.
            </p>
            <Button onClick={() => navigate('/login')} className="w-full">
              Перейти ко входу
            </Button>
          </div>
        ) : status === 'expired' ? (
          <div className="flex flex-col items-center text-center py-4">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger-light text-danger">
              <AlertCircle size={28} />
            </div>
            <h2 className="text-xl font-semibold text-theme-primary mb-2">Срок ссылки истёк</h2>
            <p className="text-theme-secondary text-sm leading-relaxed mb-6">
              Ссылка для сброса пароля действительна 1 час. Запросите новую.
            </p>
            <Link
              to="/forgot-password"
              className="text-brand hover:text-brand-hover font-medium text-sm"
            >
              Запросить новую ссылку
            </Link>
          </div>
        ) : status === 'invalid' ? (
          <div className="flex flex-col items-center text-center py-4">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger-light text-danger">
              <AlertCircle size={28} />
            </div>
            <h2 className="text-xl font-semibold text-theme-primary mb-2">
              Ссылка недействительна
            </h2>
            <p className="text-theme-secondary text-sm leading-relaxed mb-6">
              Эта ссылка уже была использована или некорректна. Запросите новую.
            </p>
            <Link
              to="/forgot-password"
              className="text-brand hover:text-brand-hover font-medium text-sm"
            >
              Запросить новую ссылку
            </Link>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-theme-primary mb-2 text-center">
              Новый пароль
            </h2>
            <p className="text-theme-secondary text-sm text-center mb-4">
              Придумайте новый пароль для вашего аккаунта.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-2" noValidate>
              <div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Новый пароль"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-10 rounded-theme-md border border-theme bg-theme-primary text-theme-primary outline-none focus:border-brand"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted hover:text-brand transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Повторите пароль"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-10 rounded-theme-md border border-theme bg-theme-primary text-theme-primary outline-none focus:border-brand"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted hover:text-brand transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="min-h-5 pt-1 pl-3 text-sm leading-4 text-danger">
                  {fieldError || '\u00A0'}
                </p>
              </div>

              <Button type="submit" disabled={isSubmitting} className="mt-1 w-full">
                {isSubmitting ? 'Сохранение...' : 'Сменить пароль'}
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
};

export default ResetPasswordPage;
