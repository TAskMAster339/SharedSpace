import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../api/client';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

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
    <div className="flex items-center justify-center min-h-[80vh] px-4">
      <Card className="w-full max-w-md">
        <h2 className="text-xl font-semibold text-theme-primary mb-4 text-center">Регистрация</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
          <div>
            <input
              type="text"
              placeholder="Имя пользователя"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-theme-md border border-theme bg-theme-primary text-theme-primary outline-none focus:border-brand"
            />
            {fieldErrors.username && (
              <p className="text-danger text-sm mt-1 pl-3">{fieldErrors.username}</p>
            )}
          </div>

          <div className="flex gap-3">
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
            {fieldErrors.email && (
              <p className="text-danger text-sm mt-1 pl-3">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <input
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-theme-md border border-theme bg-theme-primary text-theme-primary outline-none focus:border-brand"
            />
            {fieldErrors.password && (
              <p className="text-danger text-sm mt-1 pl-3">{fieldErrors.password}</p>
            )}
          </div>

          <div>
            <input
              type="password"
              placeholder="Повторите пароль"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-theme-md border border-theme bg-theme-primary text-theme-primary outline-none focus:border-brand"
            />
            {fieldErrors.confirmPassword && (
              <p className="text-danger text-sm mt-1 pl-3">{fieldErrors.confirmPassword}</p>
            )}
          </div>

          {formError && <p className="text-danger text-sm">{formError}</p>}

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
