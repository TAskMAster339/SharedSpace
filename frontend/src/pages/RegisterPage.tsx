import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import SEOHead from '../components/SEOHead';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../api/client';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

const AuthFieldError: React.FC<{ message?: string; reserve?: boolean }> = ({
  message,
  reserve = true,
}) => (
  <p className={`${reserve ? 'min-h-5 ' : ''}pt-1 pl-3 text-sm leading-4 text-danger`}>
    {message || (reserve ? '\u00A0' : '')}
  </p>
);

const MIN_PASSWORD_LENGTH = 8;

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const PRIVACY_POLICY_URL = 'https://ifbest.org/politika-konfidentsialnosti';

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!username.trim()) {
      errors.username = 'Введите имя пользователя';
    }
    if (!email.trim()) {
      errors.email = 'Введите email';
    } else if (!EMAIL_REGEX.test(email.trim())) {
      errors.email = 'Некорректный формат email';
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`;
    }
    if (confirmPassword !== password) {
      errors.confirmPassword = 'Пароли не совпадают';
    }
    if (!policyAccepted) {
      errors.policy = 'Необходимо согласиться с политикой конфиденциальности';
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
      await register({ username, firstName, lastName, email, password });
      navigate('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'conflict' && err.message.toLowerCase().includes('email')) {
          setFieldErrors((prev) => ({ ...prev, email: 'Этот email уже занят' }));
        } else if (err.code === 'conflict' && err.message.toLowerCase().includes('username')) {
          setFieldErrors((prev) => ({ ...prev, username: 'Это имя пользователя уже занято' }));
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError('Не удалось зарегистрироваться. Попробуйте позже.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-full px-4">
      <SEOHead
        title="Регистрация"
        description="Зарегистрируйтесь в SharedSpace и получите бесплатное облачное хранилище для файлов и совместной работы."
      />
      <Card className="w-full max-w-md">
        <h2 className="text-xl font-semibold text-theme-primary mb-4 text-center">Регистрация</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2" noValidate>
          <div>
            <input
              type="text"
              placeholder="Имя пользователя"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-theme-md border border-theme bg-theme-primary text-theme-primary outline-none focus:border-brand"
            />
            <AuthFieldError message={fieldErrors.username} />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Имя"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 rounded-theme-md border border-theme bg-theme-primary text-theme-primary outline-none focus:border-brand"
              />
            </div>
            <div className="flex-1">
              <input
                type="text"
                placeholder="Фамилия"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 rounded-theme-md border border-theme bg-theme-primary text-theme-primary outline-none focus:border-brand"
              />
            </div>
          </div>

          <div>
            <input
              type="email"
              placeholder="Email"
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
            <AuthFieldError message={fieldErrors.password} />
          </div>

          <div>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Повторите пароль"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 pr-10 rounded-theme-md border border-theme bg-theme-primary text-theme-primary outline-none focus:border-brand"
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
            <AuthFieldError message={fieldErrors.confirmPassword} />
          </div>

          {formError && (
            <p className="rounded-theme-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {formError}
            </p>
          )}

          <div>
            <label className="flex items-start gap-2 ml-3 text-sm text-theme-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={policyAccepted}
                onChange={(e) => setPolicyAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand cursor-pointer"
              />
              <span className="leading-5">
                Я прочитал и согласен с{' '}
                <a
                  href={PRIVACY_POLICY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand hover:text-brand-hover underline"
                >
                  политикой конфиденциальности
                </a>
              </span>
            </label>
            <AuthFieldError message={fieldErrors.policy} reserve={Boolean(fieldErrors.policy)} />
          </div>

          <Button type="submit" disabled={isSubmitting || !policyAccepted} className="mt-1 w-full">
            {isSubmitting ? 'Регистрация...' : 'Зарегистрироваться'}
          </Button>
        </form>
        <p className="mt-4 text-center text-theme-secondary text-sm">
          Уже есть аккаунт?{' '}
          <Link to="/login" className="text-brand hover:text-brand-hover font-medium">
            Войти
          </Link>
        </p>
      </Card>
    </div>
  );
};

export default RegisterPage;
