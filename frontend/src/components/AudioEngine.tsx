import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  advanceTrack,
  bindAudioPlayer,
  pauseTrack,
  resumeTrack,
  seekTrack,
  stopTrack,
  trackPath,
  useAudioPlayback,
} from '../store/audioPlaybackStore';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../hooks/useToast';

export function AudioEngine() {
  const userId = useAuthStore((state) => state.user?.id);
  const track = useAudioPlayback((state) => state.track);
  const previous = useRef<typeof track>(undefined);
  const { pathname, search } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    stopTrack();
  }, [userId]);

  useEffect(() => {
    const priorTrack = previous.current;
    previous.current = track;
    const priorPath = priorTrack?.publicPath;
    if (
      track &&
      priorTrack &&
      priorTrack.id !== track.id &&
      (priorPath ? pathname + search === priorPath : pathname === `/files/${priorTrack.id}`)
    ) {
      navigate(trackPath(track), { replace: true });
    }
  }, [navigate, pathname, search, track]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !track) return;
    const session = navigator.mediaSession;
    if (typeof MediaMetadata !== 'undefined') {
      session.metadata = new MediaMetadata({
        title: track.name,
        album: track.collection ?? '',
        artwork: track.cover ? [{ src: track.cover }] : [],
      });
    }

    const actions: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
      play: resumeTrack,
      pause: pauseTrack,
      stop: stopTrack,
      seekto: ({ seekTime }) => {
        const { duration } = useAudioPlayback.getState();
        if (duration > 0 && seekTime !== undefined) {
          seekTrack(Math.min(duration, Math.max(0, seekTime)));
        }
      },
    };
    if (track.directoryId || track.favoriteCursor || track.loadPublicPlaylist) {
      actions.previoustrack = () => void advanceTrack(-1);
      actions.nexttrack = () => void advanceTrack(1);
    }

    const registered: MediaSessionAction[] = [];
    for (const action of Object.keys(actions) as MediaSessionAction[]) {
      try {
        session.setActionHandler(action, actions[action] ?? null);
        registered.push(action);
      } catch {
        continue;
      }
    }

    return () => {
      for (const action of registered) session.setActionHandler(action, null);
      session.metadata = null;
      session.playbackState = 'none';
      session.setPositionState?.();
    };
  }, [track]);

  return (
    <audio
      ref={bindAudioPlayer}
      preload="metadata"
      onPlay={() => {
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        useAudioPlayback.setState({ playing: true });
      }}
      onPause={() => {
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = useAudioPlayback.getState().track
            ? 'paused'
            : 'none';
        }
        useAudioPlayback.setState({ playing: false });
      }}
      onTimeUpdate={({ currentTarget }) => {
        const { currentTime, duration, playbackRate } = currentTarget;
        if ('mediaSession' in navigator && Number.isFinite(duration) && duration > 0) {
          navigator.mediaSession.setPositionState?.({
            duration,
            position: Math.min(currentTime, duration),
            playbackRate,
          });
        }
        useAudioPlayback.setState({ position: currentTime });
      }}
      onDurationChange={({ currentTarget }) =>
        useAudioPlayback.setState({
          duration: Number.isFinite(currentTarget.duration) ? currentTarget.duration : 0,
        })
      }
      onEnded={() => {
        useAudioPlayback.setState({ playing: false });
        void advanceTrack(1, true);
      }}
      onError={() => {
        if (useAudioPlayback.getState().track)
          useToastStore.getState().showToast('Не удалось загрузить аудио', 'error');
      }}
    />
  );
}
