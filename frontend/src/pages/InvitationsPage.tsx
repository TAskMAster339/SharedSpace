import React, { useEffect, useState, useCallback } from 'react';
import { Mail } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { getMyInvitations, acceptInvitation, declineInvitation, Invitation } from '../api/sharing';
import { ApiError } from '../api/client';
import { EmptyState } from '../components/ui/EmptyState';
import SEOHead from '../components/SEOHead';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';

const PAGE_LIMIT = 20;

const InvitationsPage: React.FC = () => {
  const accessToken = useAuthStore((state) => state.accessToken);

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const loadInvitations = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError('');
    setCursor(undefined);
    setHasMore(false);

    try {
      const data = await getMyInvitations(accessToken, { limit: PAGE_LIMIT });
      setInvitations(data.items.filter((inv) => inv.status === 'pending'));
      setCursor(data.next_cursor);
      setHasMore(!!data.next_cursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить приглашения.');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  const loadMore = useCallback(() => {
    if (!accessToken || !cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    getMyInvitations(accessToken, { limit: PAGE_LIMIT, cursor })
      .then((data) => {
        setInvitations((prev) => [
          ...prev,
          ...data.items.filter((inv) => inv.status === 'pending'),
        ]);
        setCursor(data.next_cursor);
        setHasMore(!!data.next_cursor);
      })
      .catch((err) => console.error('Failed to load more invitations:', err))
      .finally(() => setIsLoadingMore(false));
  }, [accessToken, cursor, isLoadingMore]);

  const { sentinelRef } = useInfiniteScroll(loadMore, hasMore && !isLoadingMore);

  const handleAccept = async (id: string) => {
    if (!accessToken) return;
    setPendingActionId(id);
    try {
      await acceptInvitation(accessToken, id);
      setInvitations((prev) => prev.filter((inv) => inv.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось принять приглашение.');
    } finally {
      setPendingActionId(null);
    }
  };

  const handleDecline = async (id: string) => {
    if (!accessToken) return;
    setPendingActionId(id);
    try {
      await declineInvitation(accessToken, id);
      setInvitations((prev) => prev.filter((inv) => inv.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось отклонить приглашение.');
    } finally {
      setPendingActionId(null);
    }
  };

  return (
    <div className="space-y-6">
      <SEOHead
        title="Приглашения"
        description="Принимайте или отклоняйте приглашения к совместной работе."
      />
      <div>
        <h1 className="text-2xl font-semibold text-theme-primary mb-1 flex items-center gap-2">
          <Mail size={28} className="text-brand shrink-0" />
          Приглашения
        </h1>
        <p className="text-sm text-theme-muted">
          Принимайте или отклоняйте приглашения к совместной работе
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-theme-muted py-8 text-center">Загрузка...</p>
      ) : error ? (
        <p className="text-danger text-sm py-8 text-center">{error}</p>
      ) : invitations.length === 0 ? (
        <EmptyState icon={<Mail size={24} />} description="У вас нет новых приглашений." />
      ) : (
        <div className="space-y-3">
          {invitations.map((inv) => (
            <div
              key={inv.id}
              className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-theme-lg bg-theme-secondary border border-theme shadow-theme-card"
            >
              <Avatar
                username={inv.invited_by_username}
                fallbackClassName="text-lg"
                className="w-12 h-12"
              />

              <div className="flex-1 min-w-0">
                <p className="text-sm text-theme-primary">
                  <span className="font-medium">{inv.invited_by_username}</span> приглашает вас
                  присоединиться к{' '}
                  <span className="font-semibold text-brand">{inv.directory_name}</span>
                </p>
              </div>

              <div className="flex gap-2 sm:shrink-0">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1 sm:flex-none"
                  disabled={pendingActionId === inv.id}
                  onClick={() => handleDecline(inv.id)}
                >
                  Отклонить
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="flex-1 sm:flex-none"
                  disabled={pendingActionId === inv.id}
                  onClick={() => handleAccept(inv.id)}
                >
                  Принять
                </Button>
              </div>
            </div>
          ))}
          {hasMore && (
            <div className="flex items-center justify-center py-2">
              {isLoadingMore ? (
                <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              ) : (
                <div ref={sentinelRef} className="h-2" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InvitationsPage;
