import React, { useLayoutEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Maximize2,
  Music2,
  Pause,
  Play,
  Repeat1,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';

import {
  advanceTrack,
  seekTrack,
  setTrackVolume,
  stopTrack,
  toggleTrack,
  useAudioPlayback,
  PlaybackTrack,
} from '../../store/audioPlaybackStore';

import { PlaybackModes, PlaybackVolume, playbackControl as control } from './PlaybackOptions';
import { cn } from '../../utils/cn';

import { formatPlaybackTime, PlaybackSlider } from './PlaybackSlider';

interface AudioPreviewProps {
  src?: string;
  name: string;
  cover?: string;
  collection?: string;
  onError: () => void;
  onEnded?: (audio: HTMLAudioElement) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  session?: PlaybackTrack;
  onCollapse?: () => void;
  onExpand?: () => void;
  fullScreen?: boolean;
}

export function AudioPreview({
  src,
  name,
  cover,
  collection,
  onError,
  onEnded,
  onPrevious,
  onNext,
  session,
  onCollapse,
  onExpand,
  fullScreen = false,
}: AudioPreviewProps) {
  const audio = useRef<HTMLAudioElement>(null);
  const [localPlaying, setPlaying] = useState(false);
  const [localPosition, setPosition] = useState(0);
  const [localDuration, setDuration] = useState(0);
  const [localMuted, setMuted] = useState(false);
  const [localRepeat, setRepeat] = useState(false);
  const playback = useAudioPlayback();
  const localVolume = playback.volume;
  useLayoutEffect(() => {
    if (audio.current) audio.current.volume = localVolume;
  }, [localVolume, src]);
  const active = !!session && playback.track?.id === session.id;
  const playing = session ? active && playback.playing : localPlaying;
  const position = session ? (active ? playback.position : 0) : localPosition;
  const duration = session ? (active ? playback.duration : 0) : localDuration;

  const canAdvance = !!(
    session?.directoryId ||
    session?.favoriteCursor ||
    session?.loadPublicPlaylist
  );

  const togglePlayback = () => {
    if (session) {
      toggleTrack(session);
      return;
    }
    const player = audio.current;
    if (!player) return;
    if (player.paused) void player.play().catch(onError);
    else player.pause();
  };

  const trackKey = session?.id ?? src ?? name;
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
        {session?.publicPath && src && !fullScreen && (
          <button
            type="button"
            aria-label={`${playing ? 'Пауза' : 'Воспроизвести'}: ${name}`}
            onClick={togglePlayback}
            className={cn(
              'absolute inset-0 grid place-items-center bg-black/35 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-brand motion-safe:transition-opacity',
              !playing &&
                '[@media(hover:hover)]:opacity-0 hover:!opacity-100 focus-visible:!opacity-100',
            )}
          >
            <span className="grid size-14 place-items-center rounded-theme bg-brand text-theme-on-brand">
              {playing ? (
                <Pause size={26} fill="currentColor" />
              ) : (
                <Play size={26} fill="currentColor" />
              )}
            </span>
          </button>
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
      {src && !session && (
        <audio
          ref={audio}
          aria-label={name}
          src={src}
          loop={localRepeat}
          preload="metadata"
          onPlay={() => {
            if (useAudioPlayback.getState().track) stopTrack();
            setPlaying(true);
          }}
          onPause={() => setPlaying(false)}
          onDurationChange={({ currentTarget }) =>
            setDuration(Number.isFinite(currentTarget.duration) ? currentTarget.duration : 0)
          }
          onTimeUpdate={({ currentTarget }) => setPosition(currentTarget.currentTime)}
          onEnded={({ currentTarget }) => {
            setPlaying(false);
            onEnded?.(currentTarget);
          }}
          onError={onError}
        />
      )}
      <div className="audio-preview-controls w-full max-w-xl space-y-3">
        <div className="flex items-center gap-3 text-xs tabular-nums text-theme-secondary">
          <span>{formatPlaybackTime(position)}</span>
          <PlaybackSlider
            max={duration || 1}
            step={0.1}
            value={position}
            aria-label="Позиция воспроизведения"
            disabled={!duration}
            onChange={(event) => {
              const value = event.currentTarget.valueAsNumber;
              if (session) seekTrack(value);
              else {
                if (audio.current) audio.current.currentTime = value;
                setPosition(value);
              }
            }}
          />
          <span>{formatPlaybackTime(duration)}</span>
        </div>
        <div className="audio-preview-actions grid items-center gap-2">
          <div className="flex items-center justify-center gap-2 [grid-area:transport]">
            <button
              type="button"
              className={control}
              aria-label="Предыдущий трек"
              disabled={session ? !active || !canAdvance || playback.loadingNext : !onPrevious}
              onClick={session ? () => void advanceTrack(-1) : onPrevious}
            >
              <SkipBack size={21} />
            </button>
            <button
              type="button"
              className="inline-grid size-14 shrink-0 place-items-center rounded-theme bg-brand text-theme-on-brand transition-colors hover:bg-brand-hover disabled:opacity-40 motion-safe:transition motion-safe:active:scale-95"
              aria-label={playing ? 'Пауза' : 'Воспроизвести'}
              disabled={!src}
              onClick={togglePlayback}
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
              disabled={session ? !active || !canAdvance || playback.loadingNext : !onNext}
              onClick={session ? () => void advanceTrack(1) : onNext}
            >
              <SkipForward size={21} />
            </button>
          </div>
          <div className="justify-self-start [grid-area:modes]">
            {session ? (
              <PlaybackModes hasPlaylist={canAdvance} />
            ) : (
              <button
                type="button"
                className={control}
                aria-label="Повторять трек"
                aria-pressed={localRepeat}
                onClick={() => setRepeat(!localRepeat)}
              >
                <Repeat1 size={20} className={localRepeat ? 'text-brand' : undefined} />
              </button>
            )}
          </div>
          <div className="justify-self-end [grid-area:volume]">
            {session ? (
              <PlaybackVolume />
            ) : (
              <div className="flex w-24 shrink-0 items-center gap-1">
                <button
                  type="button"
                  className={control}
                  aria-label={localMuted ? 'Включить звук' : 'Выключить звук'}
                  onClick={() => {
                    if (audio.current) audio.current.muted = !localMuted;
                    setMuted(!localMuted);
                  }}
                >
                  {localMuted || localVolume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <PlaybackSlider
                  max={1}
                  step={0.01}
                  value={localMuted ? 0 : localVolume}
                  aria-label="Громкость"
                  showPercentage
                  onChange={(event) => {
                    const value = event.currentTarget.valueAsNumber;
                    if (audio.current) {
                      audio.current.volume = value;
                      audio.current.muted = false;
                    }
                    setMuted(false);
                    setTrackVolume(value);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
