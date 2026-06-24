import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../api/client';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      <Card className="w-full max-w-md">
        <h2 className="text-xl font-semibold text-theme-primary mb-4 text-center">Авторизация</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
          <div>
            <input
              type="email"
              placeholder="Email или username"
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

          {formError && <p className="text-danger text-sm">{formError}</p>}

          <Button type="submit" disabled={isSubmitting} className="mt-1 w-full">
            {isSubmitting ? 'Вход...' : 'Войти'}
          </Button>
        </form>
        <p className="mt-4 text-center text-theme-secondary text-sm">
          Нет аккаунта? <Link to="/register">Регистрация</Link>
        </p>
      </Card>
    </div>
  );
};

export default LoginPage;
