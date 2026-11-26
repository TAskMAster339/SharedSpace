import React, { useEffect, useRef } from 'react';
import { ChevronDown, Maximize2, Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';

import {
  advanceTrack,
  seekTrack,
  stopTrack,
  toggleTrack,
  useAudioPlayback,
  PlaybackTrack,
} from '../../store/audioPlaybackStore';

import { PlaybackModes, PlaybackVolume, playbackControl as control } from './PlaybackOptions';
import { cn } from '../../utils/cn';

import { formatPlaybackTime, PlaybackSlider } from './PlaybackSlider';

interface AudioPreviewProps {
  name: string;
  cover?: string;
  collection?: string;
  session?: PlaybackTrack;
  localSrc?: string;
  onCollapse?: () => void;
  onExpand?: () => void;
  fullScreen?: boolean;
}

function FileAudioControls({ name, src }: { name: string; src: string }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    audio.volume = useAudioPlayback.getState().volume;
    return () => audio.pause();
  }, []);

  return (
    <audio
      ref={ref}
      src={src}
      controls
      preload="metadata"
      aria-label={name}
      className="w-full max-w-xl"
      onPlay={() => {
        if (useAudioPlayback.getState().track) stopTrack();
      }}
    />
  );
}

export function AudioPreview({
  name,
  cover,
  collection,
  session,
  localSrc,
  onCollapse,
  onExpand,
  fullScreen = false,
}: AudioPreviewProps) {
  const playback = useAudioPlayback();
  const active =
    !!session &&
    playback.track?.id === session.id &&
    playback.track.publicPath === session.publicPath;
  const playing = active && playback.playing;
  const position = active ? playback.position : 0;
  const duration = active ? playback.duration : 0;

  const canAdvance = !!(
    session?.directoryId ||
    session?.favoriteCursor ||
    session?.loadPublicPlaylist
  );

  const trackKey = session?.id ?? name;
  const trackMotion = 'motion-safe:animate-[audio-preview-enter_200ms_ease-out_both]';

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center gap-5 px-4 py-6 sm:px-8 sm:py-8',
        fullScreen
          ? 'mx-auto min-h-full w-full max-w-5xl gap-6 pb-8 pt-16'
          : 'rounded-theme border border-theme bg-theme-tertiary',
      )}
    >
      {(onExpand || (fullScreen && onCollapse)) && (
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
          {onExpand && (
            <button
              type="button"
              aria-label="Открыть плеер на весь экран"
              title="На весь экран"
              className={cn(control, 'bg-theme-secondary')}
              onClick={onExpand}
            >
              <Maximize2 size={20} />
            </button>
          )}
          {fullScreen && onCollapse && (
            <button
              type="button"
              aria-label="Выйти из полноэкранного плеера"
              className={cn(control, 'bg-theme-secondary')}
              onClick={onCollapse}
            >
              <ChevronDown size={22} />
            </button>
          )}
        </div>
      )}
      <div
        key={`cover-${trackKey}`}
        className={cn(
          trackMotion,
          'relative grid aspect-square w-full place-items-center overflow-hidden rounded-theme border border-theme bg-brand-light text-brand',
          fullScreen
            ? 'max-w-[min(27rem,max(9rem,calc(100dvh-21rem)))] shadow-theme-card'
            : 'max-w-[14rem] sm:max-w-[20rem]',
        )}
      >
        {cover ? (
          <img src={cover} alt="" className="size-full object-cover" />
        ) : (
          <Music2 className="size-16" aria-hidden="true" strokeWidth={1.5} />
        )}
      </div>
      <div
        key={`details-${trackKey}`}
        className={cn(trackMotion, 'min-w-0 max-w-full space-y-1 text-center')}
      >
        <p
          className={cn(
            '[overflow-wrap:anywhere] font-semibold text-theme-primary',
            fullScreen ? 'text-2xl sm:text-3xl' : 'text-xl',
          )}
        >
          {name}
        </p>
        {collection && <p className="text-sm text-theme-secondary">{collection}</p>}
      </div>
      {localSrc ? (
        <FileAudioControls key={localSrc} name={name} src={localSrc} />
      ) : (
        <div className="audio-preview-controls w-full max-w-xl space-y-3">
          <div className="flex items-center gap-3 text-xs tabular-nums text-theme-secondary">
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
          <div className="audio-preview-actions grid items-center gap-2">
            <div className="flex items-center justify-center gap-2 [grid-area:transport]">
              <button
                type="button"
                className={control}
                aria-label="Предыдущий трек"
                disabled={!active || !canAdvance || playback.loadingNext}
                onClick={() => void advanceTrack(-1)}
              >
                <SkipBack size={21} />
              </button>
              <button
                type="button"
                className="inline-grid size-14 shrink-0 place-items-center rounded-theme bg-brand text-theme-on-brand transition-colors hover:bg-brand-hover disabled:opacity-40 motion-safe:transition motion-safe:active:scale-95"
                aria-label={playing ? 'Пауза' : 'Воспроизвести'}
                disabled={!session}
                onClick={() => toggleTrack(session)}
              >
                {playing ? (
                  <Pause size={26} fill="currentColor" />
                ) : (
                  <Play size={26} fill="currentColor" />
                )}
              </button>
              <button
                type="button"
                className={control}
                aria-label="Следующий трек"
                disabled={!active || !canAdvance || playback.loadingNext}
                onClick={() => void advanceTrack(1)}
              >
                <SkipForward size={21} />
              </button>
            </div>
            <div className="justify-self-start [grid-area:modes]">
              <PlaybackModes hasPlaylist={canAdvance} />
            </div>
            <div className="justify-self-end [grid-area:volume]">
              <PlaybackVolume />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
