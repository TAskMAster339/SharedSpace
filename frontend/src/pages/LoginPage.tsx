import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import SEOHead from '../components/SEOHead';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../api/client';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

const AuthFieldError: React.FC<{ message?: string }> = ({ message }) => (
  <p className="min-h-5 pt-1 pl-3 text-sm leading-4 text-danger">{message || '\u00A0'}</p>
);

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordError = fieldErrors.password || formError;

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!email.trim()) {
      errors.email = 'Введите email';
    }
    if (!password) {
      errors.password = 'Введите пароль';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setFormError('Неверный email или пароль');
      } else if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError('Не удалось войти. Попробуйте позже.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[80vh] px-4">
      <SEOHead
        title="Вход"
        description="Войдите в SharedSpace, чтобы получить доступ к вашим файлам и общим папкам."
      />
      <Card className="w-full max-w-md">
        <h2 className="text-xl font-semibold text-theme-primary mb-4 text-center">Авторизация</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2" noValidate>
          <div>
            <input
              type="email"
              placeholder="Email или username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-theme-md border border-theme bg-theme-primary text-theme-primary outline-none focus:border-brand"
            />
            <AuthFieldError message={fieldErrors.email} />
          </div>

          <div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 pr-10 rounded-theme-md border border-theme bg-theme-primary text-theme-primary outline-none focus:border-brand"
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
            <AuthFieldError message={passwordError} />
          </div>

          <Button type="submit" disabled={isSubmitting} className="mt-1 w-full">
            {isSubmitting ? 'Вход...' : 'Войти'}
          </Button>
        </form>
        <p className="mt-4 text-center text-theme-secondary text-sm">
          Нет аккаунта?{' '}
          <Link to="/register" className="text-brand hover:text-brand-hover font-medium">
            Регистрация
          </Link>
        </p>
      </Card>
    </div>
  );
};

export default LoginPage;
