import React, { useEffect, useRef, useState } from 'react';
import { UserPlus, Check } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { searchUsers, SearchedUser } from '../api/users';
import { getUserSharedDirectories, inviteToDirectory, InvitableDirectory } from '../api/sharing';
import { ApiError } from '../api/client';
import { SearchBar } from './ui/SearchBar';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { cn } from '../utils/cn';

const SEARCH_MIN_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;

export const UserSearch: React.FC<{ className?: string }> = ({ className }) => {
  const accessToken = useAuthStore((state) => state.accessToken);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchedUser[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const [invitableUser, setInvitableUser] = useState<SearchedUser | null>(null);
  const [directories, setDirectories] = useState<InvitableDirectory[]>([]);
  const [isLoadingDirectories, setIsLoadingDirectories] = useState(false);
  const [selectedDirectoryId, setSelectedDirectoryId] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState(false);

  useEffect(() => {
    if (!accessToken || searchQuery.trim().length < SEARCH_MIN_LENGTH) {
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(() => {
      searchUsers(accessToken, searchQuery.trim())
        .then((data) => setSearchResults(data.users))
        .catch((err) => {
          console.error('Ошибка поиска пользователей:', err);
          setSearchResults([]);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeoutId);
  }, [accessToken, searchQuery]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!searchContainerRef.current?.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const openInviteModal = (user: SearchedUser) => {
    setInvitableUser(user);
    setSelectedDirectoryId('');
    setInviteError('');
    setInviteSuccess(false);

    if (accessToken) {
      setIsLoadingDirectories(true);
      getUserSharedDirectories(accessToken, 3)
        .then(setDirectories)
        .catch(() => setDirectories([]))
        .finally(() => setIsLoadingDirectories(false));
    }
  };

  const closeInviteModal = () => {
    setInvitableUser(null);
  };

  const handleInvite = async () => {
    if (!accessToken || !invitableUser || !selectedDirectoryId) return;

    setIsInviting(true);
    setInviteError('');
    try {
      await inviteToDirectory(accessToken, selectedDirectoryId, invitableUser.username);
      setInviteSuccess(true);
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : 'Не удалось отправить приглашение.');
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <>
      <div ref={searchContainerRef} className={cn('relative', className)}>
        <SearchBar
          placeholder="Поиск людей..."
          value={searchQuery}
          onChange={(value) => {
            setSearchQuery(value);
            setIsSearchOpen(true);
          }}
        />

        {isSearchOpen && searchQuery.trim().length >= SEARCH_MIN_LENGTH && (
          <div className="absolute left-0 right-0 top-12 bg-theme-secondary rounded-theme-xl shadow-theme-dropdown border border-theme py-1 z-20 overflow-hidden max-h-80 overflow-y-auto">
            {searchResults.length === 0 ? (
              <p className="px-4 py-3 text-sm text-theme-muted">Никого не нашли</p>
            ) : (
              searchResults.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-theme-hover transition-colors"
                >
                  <img
                    src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`}
                    alt={user.username}
                    className="w-8 h-8 rounded-theme-full bg-theme-tertiary shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-theme-primary font-medium truncate">
                      {user.first_name || user.second_name
                        ? `${user.first_name ?? ''} ${user.second_name ?? ''}`.trim()
                        : user.username}
                    </p>
                    <p className="text-xs text-theme-muted truncate">@{user.username}</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="shrink-0 flex items-center gap-1.5"
                    onClick={() => {
                      setIsSearchOpen(false);
                      openInviteModal(user);
                    }}
                  >
                    <UserPlus size={14} /> Пригласить
                  </Button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <Modal
        isOpen={!!invitableUser}
        onClose={closeInviteModal}
        title={`Пригласить ${invitableUser?.username ?? ''}`}
      >
        {inviteSuccess ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-theme-full bg-brand-light flex items-center justify-center text-brand mx-auto mb-3">
              <Check size={24} />
            </div>
            <p className="text-sm text-theme-primary font-medium">Приглашение отправлено</p>
            <Button variant="secondary" size="sm" className="mt-4" onClick={closeInviteModal}>
              Закрыть
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-theme-muted">Выберите общую директорию для приглашения:</p>

            {isLoadingDirectories ? (
              <p className="text-sm text-theme-muted text-center py-4">Загрузка...</p>
            ) : directories.length === 0 ? (
              <p className="text-sm text-theme-muted text-center py-4">
                Нет директорий, в которые вы можете приглашать.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {directories.map((dir) => {
                  const isSelected = selectedDirectoryId === dir.id;
                  return (
                    <button
                      key={dir.id}
                      type="button"
                      onClick={() => setSelectedDirectoryId(dir.id)}
                      className={cn(
                        'w-full flex items-center justify-between gap-2 text-left px-4 py-2.5 rounded-theme-md border-2 transition-colors text-sm',
                        isSelected
                          ? 'border-brand bg-brand text-theme-on-brand font-medium'
                          : 'border-theme-hover bg-theme-tertiary text-theme-secondary hover:border-brand/50',
                      )}
                    >
                      <span className="truncate">{dir.name}</span>
                      {isSelected && <Check size={16} className="shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {inviteError && <p className="text-danger text-sm">{inviteError}</p>}

            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={closeInviteModal}>
                Отмена
              </Button>
              <Button
                className="flex-1"
                disabled={!selectedDirectoryId || isInviting}
                onClick={handleInvite}
              >
                {isInviting ? 'Отправка...' : 'Отправить приглашение'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};
