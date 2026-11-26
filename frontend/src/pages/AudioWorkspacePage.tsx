import React, { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AudioPreview } from '../components/ui/AudioPreview';
import { useAudioPlayback } from '../store/audioPlaybackStore';
import SEOHead from '../components/SEOHead';

export default function AudioWorkspacePage() {
  const track = useAudioPlayback((state) => state.track);
  const navigate = useNavigate();
  const location = useLocation();
  const returnPath =
    typeof location.state?.returnPath === 'string' && /^\/(?!\/)/.test(location.state.returnPath)
      ? location.state.returnPath
      : '/dashboard';

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented)
        navigate(returnPath, { replace: true });
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [navigate, returnPath]);

  return (
    <main className="min-h-0 flex-1 overflow-auto bg-theme-primary">
      <SEOHead title="Плеер" description="Воспроизведение музыки в SharedSpace" />
      {track ? (
        <AudioPreview
          key={track.id}
          name={track.name}
          cover={track.cover}
          collection={track.collection}
          session={track}
          fullScreen
          onCollapse={() => navigate(returnPath, { replace: true })}
        />
      ) : (
        <div className="grid min-h-full place-content-center gap-3 p-4 text-center text-theme-secondary">
          <p>Выберите трек для воспроизведения.</p>
          <Link to={returnPath} className="font-medium text-brand hover:underline">
            Вернуться в хранилище
          </Link>
        </div>
      )}
    </main>
  );
}
