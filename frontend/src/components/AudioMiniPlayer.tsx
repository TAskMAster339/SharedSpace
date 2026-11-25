import React from 'react';
import {
  ChevronDown,
  ChevronUp,
  Music2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  X,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import {
  advanceTrack,
  seekTrack,
  stopTrack,
  toggleTrack,
  trackPath,
  useAudioPlayback,
} from '../store/audioPlaybackStore';

const control =
  'inline-grid size-10 shrink-0 place-items-center rounded-theme text-theme-secondary transition-colors hover:bg-theme-hover hover:text-theme-primary disabled:opacity-40';

function useMiniPlayback() {
  const state = useAudioPlayback();
  const { pathname } = useLocation();
  const show = !!state.track && pathname !== `/files/${state.track.id}`;
  return { ...state, show };
}

function Transport() {
  const { track, playing, loadingNext } = useAudioPlayback();
  const canAdvance = !!(track?.directoryId || track?.favoriteCursor) && !loadingNext;
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        className={control}
        disabled={!canAdvance}
        aria-label="Предыдущий трек"
        onClick={() => void advanceTrack(-1)}
      >
        <SkipBack size={19} />
      </button>
      <button
        type="button"
        className="inline-grid size-10 shrink-0 place-items-center rounded-full bg-brand text-theme-on-brand hover:bg-brand-hover"
        aria-label={playing ? 'Пауза' : 'Воспроизвести'}
        onClick={() => toggleTrack()}
      >
        {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
      </button>
      <button
        type="button"
        className={control}
        disabled={!canAdvance}
        aria-label="Следующий трек"
        onClick={() => void advanceTrack(1)}
      >
        <SkipForward size={19} />
      </button>
    </div>
  );
}

function TrackLink({ onClick }: { onClick?: () => void }) {
  const track = useAudioPlayback((state) => state.track);
  if (!track) return null;
  return (
    <Link
      to={trackPath(track)}
      onClick={onClick}
      className="flex min-w-0 items-center gap-3 rounded-theme text-left hover:text-brand"
    >
      <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-theme bg-brand-light text-brand">
        {track.cover ? (
          <img src={track.cover} alt="" className="size-full object-cover" />
        ) : (
          <Music2 size={20} aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{track.name}</span>
        {track.collection && (
          <span className="block truncate text-xs text-theme-secondary">{track.collection}</span>
        )}
      </span>
    </Link>
  );
}

function PlaybackProgress() {
  const duration = useAudioPlayback((state) => state.duration);
  const position = useAudioPlayback((state) => state.position);
  return (
    <input
      type="range"
      min={0}
      max={duration || 1}
      step={0.1}
      value={position}
      aria-label="Позиция воспроизведения"
      disabled={!duration}
      className="h-5 min-w-0 w-full accent-[var(--brand)]"
      onChange={(event) => seekTrack(event.currentTarget.valueAsNumber)}
    />
  );
}

function StopButton({ onStop }: { onStop?: () => void }) {
  return (
    <button
      type="button"
      className={control}
      aria-label="Остановить и закрыть плеер"
      title="Остановить и закрыть"
      onClick={() => {
        stopTrack();
        onStop?.();
      }}
    >
      <X size={20} />
    </button>
  );
}

export function DesktopAudioMiniPlayer() {
  const { show, compact } = useMiniPlayback();
  if (!show) return null;
  return (
    <aside
      aria-label="Мини-плеер"
      className="sticky bottom-0 z-30 hidden justify-end px-4 pb-3 md:flex"
    >
      <div
        className={`flex items-center gap-3 rounded-theme border border-theme bg-theme-secondary p-2 shadow-theme-card ${compact ? 'max-w-[21rem]' : 'w-full max-w-6xl'}`}
      >
        <div className={compact ? 'min-w-0 flex-1' : 'min-w-0 flex-1 basis-40'}>
          <TrackLink />
        </div>
        {!compact && (
          <>
            <Transport />
            <div className="min-w-16 flex-1">
              <PlaybackProgress />
            </div>
          </>
        )}
        <button
          type="button"
          aria-expanded={!compact}
          className={control}
          aria-label={compact ? 'Развернуть мини-плеер' : 'Свернуть мини-плеер'}
          onClick={() => useAudioPlayback.setState({ compact: !compact })}
        >
          {compact ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        <StopButton />
      </div>
    </aside>
  );
}
