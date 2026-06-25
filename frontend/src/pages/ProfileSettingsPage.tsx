import React, { useState } from 'react';
import { User, AtSign, Mail, Lock, Pencil, Check, X, KeyRound, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../api/client';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Avatar } from '../components/ui/Avatar';
import { cn } from '../utils/cn';

const MIN_PASSWORD_LENGTH = 8;

interface FieldProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  error?: string;
}

const Field: React.FC<FieldProps> = ({
  label,
  icon,
  value,
  onChange,
  type = 'text',
  placeholder,
  error,
}) => (
  <div>
    <label className="text-xs font-medium text-theme-secondary mb-1.5 block">{label}</label>
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted">{icon}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full pl-10 pr-3 py-2.5 rounded-theme-md border-2 outline-none transition-colors text-sm',
          'bg-theme-tertiary text-theme-primary placeholder:text-theme-muted',
          error ? 'border-danger' : 'border-theme-hover focus:border-brand',
        )}
      />
    </div>
    {error && <p className="text-danger text-xs mt-1.5 pl-10">{error}</p>}
  </div>
);

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const InfoRow: React.FC<InfoRowProps> = ({ icon, label, value }) => (
  <div className="flex items-center gap-3 py-3 border-b border-theme last:border-b-0">
    <span className="flex items-center justify-center w-9 h-9 rounded-theme-full bg-theme-tertiary text-theme-muted shrink-0">
      {icon}
    </span>
    <div className="min-w-0">
      <p className="text-xs text-theme-secondary">{label}</p>
      <p className="text-theme-primary font-medium truncate">{value || '—'}</p>
    </div>
  </div>
);

const ProfileSettingsPage: React.FC = () => {
  const { user, updateProfile, changePassword, deleteAccount } = useAuth();
  const navigate = useNavigate();

  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState(user?.username ?? '');
  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName, setLastName] = useState(user?.second_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');

  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [profileFormError, setProfileFormError] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [passwordFormError, setPasswordFormError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const startEditing = () => {
    setUsername(user?.username ?? '');
    setFirstName(user?.first_name ?? '');
    setLastName(user?.second_name ?? '');
    setEmail(user?.email ?? '');
    setProfileErrors({});
    setProfileFormError('');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setProfileErrors({});
    setProfileFormError('');
  };

  const validateProfile = (): boolean => {
    const errors: Record<string, string> = {};
    if (!username.trim()) {
      errors.username = 'Введите имя пользователя';
    }
    if (!email.trim()) {
      errors.email = 'Введите email';
    }
    setProfileErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileFormError('');

    if (!validateProfile()) {
      return;
    }

    setIsSavingProfile(true);
    try {
      await updateProfile({ email, username, firstName, lastName });
      setIsEditing(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'conflict' && err.message.toLowerCase().includes('email')) {
          setProfileErrors((prev) => ({ ...prev, email: 'Этот email уже занят' }));
        } else if (err.code === 'conflict' && err.message.toLowerCase().includes('username')) {
          setProfileErrors((prev) => ({ ...prev, username: 'Это имя пользователя уже занято' }));
        } else {
          setProfileFormError(err.message);
        }
      } else {
        setProfileFormError('Не удалось сохранить изменения. Попробуйте позже.');
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  const startChangingPassword = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setPasswordErrors({});
    setPasswordFormError('');
    setPasswordSuccess('');
    setIsChangingPassword(true);
  };

  const cancelChangingPassword = () => {
    setIsChangingPassword(false);
    setPasswordErrors({});
    setPasswordFormError('');
  };

  const validatePassword = (): boolean => {
    const errors: Record<string, string> = {};
    if (!oldPassword) {
      errors.oldPassword = 'Введите текущий пароль';
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      errors.newPassword = `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`;
    }
    if (confirmNewPassword !== newPassword) {
      errors.confirmNewPassword = 'Пароли не совпадают';
    }
    setPasswordErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordFormError('');
    setPasswordSuccess('');

    if (!validatePassword()) {
      return;
    }

    setIsSavingPassword(true);
    try {
      await changePassword(oldPassword, newPassword);
      setPasswordSuccess('Пароль успешно изменён');
      setIsChangingPassword(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setPasswordFormError(err.message);
      } else {
        setPasswordFormError('Не удалось изменить пароль. Попробуйте позже.');
      }
    } finally {
      setIsSavingPassword(false);
    }
  };

  const openDeleteModal = () => {
    setDeleteError('');
    setIsDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setDeleteError('');
  };

  const handleDeleteAccount = async () => {
    setDeleteError('');
    setIsDeleting(true);
    try {
      await deleteAccount();
      navigate('/login');
    } catch (err) {
      if (err instanceof ApiError) {
        setDeleteError(err.message);
      } else if (err instanceof Error) {
        setDeleteError(err.message);
      } else {
        setDeleteError('Не удалось удалить аккаунт. Попробуйте позже.');
      }
      setIsDeleting(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-0 space-y-5 pb-10">
      {/* Hero-блок профиля */}
      <Card className="relative overflow-hidden p-0">
        <div className="h-20 sm:h-24 bg-gradient-to-r from-brand to-brand-dark" />
        <div className="px-4 sm:px-6 pb-5 sm:pb-6 -mt-10 sm:-mt-12 flex flex-col sm:flex-row sm:items-end gap-4">
          <Avatar
            username={user.username}
            displayName={user.first_name || user.second_name}
            fallbackClassName="text-3xl"
            className="w-20 h-20 sm:w-24 sm:h-24 border-4 border-theme-secondary shadow-theme-card"
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl font-semibold text-theme-primary truncate">
              {user.first_name || user.second_name
                ? `${user.first_name ?? ''} ${user.second_name ?? ''}`.trim()
                : user.username}
            </h1>
            <p className="text-sm text-theme-secondary truncate">@{user.username}</p>
          </div>
          {!isEditing && (
            <Button
              variant="secondary"
              size="sm"
              onClick={startEditing}
              className="flex items-center gap-1.5 self-start sm:self-auto"
            >
              <Pencil size={14} /> Редактировать
            </Button>
          )}
        </div>
      </Card>

      {/* Личные данные */}
      <Card>
        <CardHeader>
          <CardTitle>Личные данные</CardTitle>
        </CardHeader>

        {!isEditing ? (
          <div>
            <InfoRow icon={<User size={16} />} label="Имя" value={user.first_name ?? ''} />
            <InfoRow icon={<User size={16} />} label="Фамилия" value={user.second_name ?? ''} />
            <InfoRow icon={<AtSign size={16} />} label="Имя пользователя" value={user.username} />
            <InfoRow icon={<Mail size={16} />} label="Email" value={user.email} />
          </div>
        ) : (
          <form onSubmit={handleProfileSubmit} className="flex flex-col gap-4" noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Имя"
                icon={<User size={16} />}
                value={firstName}
                onChange={setFirstName}
              />
              <Field
                label="Фамилия"
                icon={<User size={16} />}
                value={lastName}
                onChange={setLastName}
              />
            </div>

            <Field
              label="Имя пользователя"
              icon={<AtSign size={16} />}
              value={username}
              onChange={setUsername}
              error={profileErrors.username}
            />

            <Field
              label="Email"
              icon={<Mail size={16} />}
              type="email"
              value={email}
              onChange={setEmail}
              error={profileErrors.email}
            />

            {profileFormError && <p className="text-danger text-sm">{profileFormError}</p>}

            <div className="flex flex-col sm:flex-row gap-3 mt-1">
              <Button
                type="submit"
                disabled={isSavingProfile}
                className="flex-1 flex items-center justify-center gap-1.5"
              >
                <Check size={16} /> {isSavingProfile ? 'Сохранение...' : 'Сохранить'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={cancelEditing}
                disabled={isSavingProfile}
                className="flex-1 flex items-center justify-center gap-1.5"
              >
                <X size={16} /> Отмена
              </Button>
            </div>
          </form>
        )}
      </Card>

      {/* Пароль */}
      <Card>
        <CardHeader>
          <CardTitle>Безопасность</CardTitle>
          {!isChangingPassword && (
            <Button
              variant="secondary"
              size="sm"
              onClick={startChangingPassword}
              className="flex items-center gap-1.5"
            >
              <KeyRound size={14} /> Изменить пароль
            </Button>
          )}
        </CardHeader>

        {!isChangingPassword ? (
          <InfoRow icon={<Lock size={16} />} label="Пароль" value={passwordSuccess || '••••••••'} />
        ) : (
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4" noValidate>
            <Field
              label="Текущий пароль"
              icon={<Lock size={16} />}
              type="password"
              value={oldPassword}
              onChange={setOldPassword}
              error={passwordErrors.oldPassword}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Новый пароль"
                icon={<Lock size={16} />}
                type="password"
                value={newPassword}
                onChange={setNewPassword}
                error={passwordErrors.newPassword}
              />
              <Field
                label="Повторите новый пароль"
                icon={<Lock size={16} />}
                type="password"
                value={confirmNewPassword}
                onChange={setConfirmNewPassword}
                error={passwordErrors.confirmNewPassword}
              />
            </div>

            {passwordFormError && <p className="text-danger text-sm">{passwordFormError}</p>}

            <div className="flex flex-col sm:flex-row gap-3 mt-1">
              <Button
                type="submit"
                disabled={isSavingPassword}
                className="flex-1 flex items-center justify-center gap-1.5"
              >
                <Check size={16} /> {isSavingPassword ? 'Сохранение...' : 'Изменить пароль'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={cancelChangingPassword}
                disabled={isSavingPassword}
                className="flex-1 flex items-center justify-center gap-1.5"
              >
                <X size={16} /> Отмена
              </Button>
            </div>
          </form>
        )}
      </Card>

      {/* Удаление аккаунта*/}
      <Card>
        <CardHeader>
          <CardTitle className="text-danger">Удаление аккаунта</CardTitle>
        </CardHeader>
        <div className="border border-danger/20 rounded-theme-md p-4 bg-danger-light/10">
          <p className="text-sm text-theme-secondary mb-3">
            Удаление аккаунта приведёт к безвозвратному удалению всех ваших файлов, директорий и
            данных.
            <br />
            Это действие нельзя отменить.
          </p>
          <Button variant="danger" onClick={openDeleteModal} className="flex items-center gap-2">
            <Trash2 size={16} />
            Удалить аккаунт
          </Button>
        </div>
      </Card>

      {/* Модальное окно подтверждения */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={closeDeleteModal}
        onConfirm={handleDeleteAccount}
        variant="danger"
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        showCancel={true}
        isConfirming={isDeleting}
        error={deleteError}
        title={
          <div>
            <h3 className="text-lg font-semibold text-theme-primary">Удаление аккаунта</h3>
            <p className="text-sm text-theme-muted">Это действие нельзя будет отменить</p>
          </div>
        }
        description={
          <p className="text-sm text-theme-secondary mt-2">
            Вы уверены, что хотите полностью удалить свой аккаунт?
            <br />
            Все ваши файлы, директории и данные будут безвозвратно удалены.
          </p>
        }
      />
    </div>
  );
};

export default ProfileSettingsPage;
