import React, { useLayoutEffect, useRef, useState } from 'react';
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
import { useToastStore } from '../hooks/useToast';
import { Link, useLocation } from 'react-router-dom';
import {
  advanceTrack,
  PlaybackTrack,
  seekTrack,
  stopTrack,
  toggleTrack,
  trackPath,
  useAudioPlayback,
} from '../store/audioPlaybackStore';
import { PlaybackModes, PlaybackVolume } from './ui/PlaybackOptions';

import { formatPlaybackTime, PlaybackSlider } from './ui/PlaybackSlider';

const control =
  'inline-grid size-10 shrink-0 place-items-center rounded-theme text-theme-secondary transition-colors hover:bg-theme-hover hover:text-theme-primary disabled:opacity-40 motion-safe:transition motion-safe:active:scale-90';

function useMiniPlayback() {
  const state = useAudioPlayback();
  const { pathname, search } = useLocation();
  const show =
    !!state.track &&
    (state.track.publicPath
      ? pathname + search !== state.track.publicPath
      : pathname !== `/files/${state.track.id}`);
  return { ...state, show };
}

function Transport() {
  const { track, playing, loadingNext } = useAudioPlayback();
  const canAdvance =
    !!(track?.directoryId || track?.favoriteCursor || track?.loadPublicPlaylist) && !loadingNext;
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
        className="inline-grid size-10 shrink-0 place-items-center rounded-theme bg-brand text-theme-on-brand hover:bg-brand-hover motion-safe:transition-transform motion-safe:active:scale-95"
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

function TrackDetails({ track }: { track: PlaybackTrack }) {
  return (
    <>
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
    </>
  );
}

const trackDetailsClass = 'flex min-w-0 items-center gap-3 rounded-theme text-left';

function TrackLink() {
  const track = useAudioPlayback((state) => state.track);
  const priorTrack = useRef(track);
  const [leaving, setLeaving] = useState<PlaybackTrack>();
  const trackId = track?.id;

  useLayoutEffect(() => {
    const previous = priorTrack.current;
    priorTrack.current = useAudioPlayback.getState().track;
    if (
      !previous ||
      !trackId ||
      previous.id === trackId ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setLeaving(undefined);
      return;
    }
    setLeaving(previous);
    const timer = window.setTimeout(() => setLeaving(undefined), 200);
    return () => window.clearTimeout(timer);
  }, [trackId]);

  if (!track) return null;
  return (
    <div className="relative overflow-hidden rounded-theme">
      {leaving && (
        <div
          key={leaving.id}
          aria-hidden="true"
          className={`${trackDetailsClass} pointer-events-none absolute inset-0 animate-[mini-track-out_200ms_ease-out_both]`}
        >
          <TrackDetails track={leaving} />
        </div>
      )}
      <Link
        key={track.id}
        to={trackPath(track)}
        className={`${trackDetailsClass} hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand ${leaving ? 'animate-[mini-track-in_200ms_ease-out_both]' : ''}`}
      >
        <TrackDetails track={track} />
      </Link>
    </div>
  );
}

function PlaybackProgress() {
  const trackId = useAudioPlayback((state) => state.track?.id);
  const duration = useAudioPlayback((state) => state.duration);
  const position = useAudioPlayback((state) => state.position);
  const progress = duration ? Math.min(1, Math.max(0, position / duration)) : 0;
  const previous = useRef({ trackId, progress });
  const trackFill = useRef<HTMLSpanElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const prior = previous.current;
    previous.current = { trackId, progress };
    if (
      prior.trackId === trackId ||
      !prior.trackId ||
      !trackId ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const motion = { duration: 200, easing: 'cubic-bezier(0.2, 0.7, 0.25, 1)' };
    trackFill.current?.animate(
      [{ transform: `scaleX(${prior.progress})` }, { transform: `scaleX(${progress})` }],
      motion,
    );
    thumb.current?.animate(
      [
        { transform: `translateX(${prior.progress * 100}%)` },
        { transform: `translateX(${progress * 100}%)` },
      ],
      motion,
    );
  }, [progress, trackId]);

  return (
    <div className="flex w-full items-center gap-2 text-xs tabular-nums text-theme-secondary">
      <span>{formatPlaybackTime(position)}</span>
      <div className="relative flex min-w-0 flex-1 items-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[7px] h-1 rounded-full bg-[var(--border)]"
        >
          <span
            ref={trackFill}
            className="absolute inset-0 origin-left rounded-full bg-brand"
            style={{ transform: `scaleX(${progress})` }}
          />
          <span
            ref={thumb}
            className="absolute inset-0"
            style={{ transform: `translateX(${progress * 100}%)` }}
          >
            <span className="absolute left-0 top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand" />
          </span>
        </div>
        <PlaybackSlider
          className="mini-playback-input relative"
          max={duration || 1}
          step={0.1}
          value={position}
          aria-label="Позиция воспроизведения"
          disabled={!duration}
          onChange={(event) => seekTrack(event.currentTarget.valueAsNumber)}
        />
      </div>
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
  const panel = useRef<HTMLElement>(null);
  const previousBounds = useRef<DOMRect>();
  const runningAnimation = useRef<Animation>();

  useLayoutEffect(() => {
    const element = panel.current;
    if (!show || !element) return;
    const updateToastOffset = () => {
      const bounds = element.getBoundingClientRect();
      const offset =
        bounds.height && bounds.bottom > 0 && bounds.top < window.innerHeight
          ? Math.ceil(window.innerHeight - bounds.top + 16)
          : 16;
      useToastStore.getState().setToastDesktopBottomPx(offset);
    };
    updateToastOffset();
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(updateToastOffset);
    observer?.observe(element);
    window.addEventListener('scroll', updateToastOffset, { passive: true });
    window.addEventListener('resize', updateToastOffset);
    return () => {
      observer?.disconnect();
      window.removeEventListener('scroll', updateToastOffset);
      window.removeEventListener('resize', updateToastOffset);
      useToastStore.getState().setToastDesktopBottomPx(16);
    };
  }, [show]);

  useLayoutEffect(() => {
    const element = panel.current;
    const previous = previousBounds.current;
    previousBounds.current = undefined;
    runningAnimation.current?.cancel();
    if (!element || !previous || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;
    const next = element.getBoundingClientRect();
    runningAnimation.current = element.animate(
      [
        { width: `${previous.width}px`, overflow: 'hidden' },
        { width: `${next.width}px`, overflow: 'hidden' },
      ],
      { duration: 240, easing: 'cubic-bezier(0.2, 0.75, 0.25, 1)' },
    );
    return () => runningAnimation.current?.cancel();
  }, [compact]);

  if (!show || !track) return null;
  const hasPlaylist = !!(track.directoryId || track.favoriteCursor || track.loadPublicPlaylist);
  return (
    <div className="audio-mini-container pointer-events-none sticky bottom-4 z-30 mx-4 mb-4 hidden shrink-0 md:block lg:mx-6">
      <aside
        ref={panel}
        aria-label="Мини-плеер"
        className={`audio-mini-player pointer-events-auto relative ml-auto rounded-theme border border-theme bg-theme-secondary shadow-theme-dropdown ${compact ? 'w-[21rem] max-w-full' : 'w-full'}`}
      >
        <Link
          to="/player"
          state={{ returnPath: location.pathname + location.search }}
          aria-label="Открыть плеер на весь экран"
          className="absolute inset-0 rounded-theme motion-safe:transition-colors hover:bg-theme-hover/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        />
        <div
          className="audio-mini-layout pointer-events-none relative grid h-full items-center gap-x-3 px-3 py-2 sm:px-4 [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_input]:pointer-events-auto"
          data-compact={compact}
        >
          <div className="min-w-0 [grid-area:track]">
            <TrackLink />
          </div>
          {!compact && (
            <div className="grid min-w-0 justify-items-center gap-0.5 [grid-area:transport]">
              <PlaybackProgress />
              <Transport />
            </div>
          )}
          {!compact && (
            <div className="flex items-center justify-end [grid-area:options]">
              <PlaybackModes hasPlaylist={hasPlaylist} />
              <PlaybackVolume />
            </div>
          )}
          <div className="flex items-center justify-end [grid-area:actions]">
            <button
              type="button"
              aria-expanded={!compact}
              className={control}
              aria-label={compact ? 'Развернуть мини-плеер' : 'Свернуть мини-плеер'}
              onClick={() => {
                previousBounds.current = panel.current?.getBoundingClientRect();
                useAudioPlayback.setState({ compact: !compact });
              }}
            >
              {compact ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
            <StopButton />
          </div>
        </div>
      </aside>
    </div>
  );
}
