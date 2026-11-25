import React from 'react';
import {
  ChevronDown,
  ChevronUp,
  Maximize2,
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
  useAudioPlayback,
} from '../store/audioPlaybackStore';
import { PlaybackModes, PlaybackVolume } from './ui/PlaybackOptions';

import { formatPlaybackTime, PlaybackSlider } from './ui/PlaybackSlider';

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

function TrackLink() {
  const location = useLocation();
  const track = useAudioPlayback((state) => state.track);
  if (!track) return null;
  return (
    <Link
      to="/player"
      state={{ returnPath: location.pathname + location.search }}
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
    <div className="flex w-full items-center gap-2 text-xs tabular-nums text-theme-secondary">
      <span>{formatPlaybackTime(position)}</span>
      <PlaybackSlider
        max={duration || 1}
        step={0.1}
        value={position}
        aria-label="Позиция воспроизведения"
        disabled={!duration}
        onChange={(event) => seekTrack(event.currentTarget.valueAsNumber)}
      />
      <span>{formatPlaybackTime(duration)}</span>
    </div>
  );
}

function StopButton() {
  return (
    <button
      type="button"
      className={control}
      aria-label="Остановить и закрыть плеер"
      title="Остановить и закрыть"
      onClick={stopTrack}
    >
      <X size={20} />
    </button>
  );
}

export function DesktopAudioMiniPlayer() {
  const { show, compact, track } = useMiniPlayback();
  const location = useLocation();
  if (!show || !track) return null;
  const hasPlaylist = !!(track.directoryId || track.favoriteCursor);
  return (
    <aside
      aria-label="Мини-плеер"
      className="sticky bottom-0 z-30 hidden w-full shrink-0 border-y border-theme bg-theme-secondary shadow-theme-card md:block"
    >
      <div className="grid w-full grid-cols-[minmax(8rem,1fr)_auto] items-center gap-x-4 px-4 py-2 lg:grid-cols-[minmax(12rem,1fr)_minmax(16rem,1.2fr)_minmax(12rem,1fr)] lg:px-6">
        <div className="col-start-1 row-start-1 min-w-0">
          <TrackLink />
        </div>
        {!compact && (
          <div className="col-span-full row-start-2 grid min-w-0 justify-items-center gap-0.5 lg:col-span-1 lg:col-start-2 lg:row-start-1">
            <Transport />
            <PlaybackProgress />
          </div>
        )}
        <div className="col-start-2 row-start-1 flex items-center justify-end gap-1 lg:col-start-3">
          {!compact && (
            <>
              <PlaybackModes hasPlaylist={hasPlaylist} />
              <PlaybackVolume />
            </>
          )}
          <Link
            to="/player"
            state={{ returnPath: location.pathname + location.search }}
            aria-label="Открыть плеер на весь экран"
            title="На весь экран"
            className={control}
          >
            <Maximize2 size={19} />
          </Link>
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
      </div>
    </aside>
  );
}
