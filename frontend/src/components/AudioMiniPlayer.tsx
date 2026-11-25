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
      className="audio-mini-player sticky bottom-4 z-30 mx-4 mb-4 hidden shrink-0 rounded-theme border border-theme bg-theme-secondary shadow-theme-dropdown md:block lg:mx-6"
    >
      <div
        className="audio-mini-layout grid items-center gap-x-3 px-3 py-2 sm:px-4"
        data-compact={compact}
      >
        <div className="min-w-0 [grid-area:track]">
          <TrackLink />
        </div>
        {!compact && (
          <div className="grid min-w-0 justify-items-center gap-0.5 [grid-area:transport]">
            <Transport />
            <PlaybackProgress />
          </div>
        )}
        {!compact && (
          <div className="flex items-center justify-end [grid-area:options]">
            <PlaybackModes hasPlaylist={hasPlaylist} />
            <PlaybackVolume />
          </div>
        )}
        <div className="flex items-center justify-end [grid-area:actions]">
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
