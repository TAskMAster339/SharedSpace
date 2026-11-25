import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
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
  playTrack,
  seekTrack,
  setTrackVolume,
  toggleTrack,
  toggleTrackMute,
  toggleTrackRepeat,
  useAudioPlayback,
  PlaybackTrack,
} from '../../store/audioPlaybackStore';

interface AudioPreviewProps {
  src?: string;
  name: string;
  cover?: string;
  collection?: string;
  autoPlay?: boolean;
  onError: () => void;
  onEnded?: (audio: HTMLAudioElement) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  session?: PlaybackTrack;
  onCollapse?: () => void;
}

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function AudioPreview({
  src,
  name,
  cover,
  collection,
  autoPlay,
  onError,
  onEnded,
  onPrevious,
  onNext,
  session,
  onCollapse,
}: AudioPreviewProps) {
  const audio = useRef<HTMLAudioElement>(null);
  const [localPlaying, setPlaying] = useState(false);
  const [localPosition, setPosition] = useState(0);
  const [localDuration, setDuration] = useState(0);
  const [localVolume, setVolume] = useState(1);
  const [localMuted, setMuted] = useState(false);
  const [localRepeat, setRepeat] = useState(false);
  const playback = useAudioPlayback();
  const active = !!session && playback.track?.id === session.id;
  const playing = session ? active && playback.playing : localPlaying;
  const position = session ? (active ? playback.position : 0) : localPosition;
  const duration = session ? (active ? playback.duration : 0) : localDuration;
  const volume = session ? playback.volume : localVolume;
  const muted = session ? playback.muted : localMuted;
  const repeat = session ? playback.repeat : localRepeat;
  const canAdvance = !!(session?.directoryId || session?.favoriteCursor);

  useEffect(() => {
    if (autoPlay && session && useAudioPlayback.getState().track?.id !== session.id)
      playTrack(session);
  }, [autoPlay, session]);

  const control =
    'inline-grid size-11 place-items-center rounded-full text-theme-secondary transition-colors hover:bg-theme-hover hover:text-theme-primary disabled:opacity-40';
  const range = 'h-5 w-full cursor-pointer accent-[var(--brand)] disabled:cursor-default';

  return (
    <div className="relative flex flex-col items-center gap-5 rounded-theme border border-theme bg-theme-tertiary px-4 py-6 sm:px-8 sm:py-8">
      {onCollapse && active && (
        <button
          type="button"
          aria-label="Свернуть плеер"
          className={`${control} absolute right-2 top-2 z-10 bg-theme-secondary`}
          onClick={onCollapse}
        >
          <ChevronDown size={22} />
        </button>
      )}
      <div className="grid aspect-square w-full max-w-[17rem] place-items-center overflow-hidden rounded-theme border border-theme bg-brand-light text-brand sm:max-w-[20rem]">
        {cover ? (
          <img src={cover} alt="" className="size-full object-cover" />
        ) : (
          <Music2 className="size-16" aria-hidden="true" strokeWidth={1.5} />
        )}
      </div>
      <div className="min-w-0 max-w-full space-y-1 text-center">
        <p className="break-words text-xl font-semibold text-theme-primary">{name}</p>
        {collection && <p className="text-sm text-theme-secondary">{collection}</p>}
      </div>
      {src && !session && (
        <audio
          ref={audio}
          aria-label={name}
          src={src}
          autoPlay={autoPlay}
          loop={repeat}
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
      <div className="w-full max-w-xl space-y-3">
        <div className="flex items-center gap-3 text-xs tabular-nums text-theme-secondary">
          <span>{clock(position)}</span>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={position}
            aria-label="Позиция воспроизведения"
            disabled={!duration}
            className={range}
            onChange={(event) => {
              const value = event.currentTarget.valueAsNumber;
              if (session) seekTrack(value);
              else {
                if (audio.current) audio.current.currentTime = value;
                setPosition(value);
              }
            }}
          />
          <span>{clock(duration)}</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-3">
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
            className="inline-grid size-14 shrink-0 place-items-center rounded-full bg-brand text-theme-on-brand transition-colors hover:bg-brand-hover disabled:opacity-40"
            aria-label={playing ? 'Пауза' : 'Воспроизвести'}
            disabled={!src}
            onClick={() => {
              if (session) {
                toggleTrack(session);
                return;
              }
              const player = audio.current;
              if (!player) return;
              if (player.paused) void player.play().catch(onError);
              else player.pause();
            }}
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
          <button
            type="button"
            className={control}
            aria-label="Повторять трек"
            aria-pressed={repeat}
            onClick={session ? toggleTrackRepeat : () => setRepeat(!repeat)}
          >
            <Repeat1 size={20} className={repeat ? 'text-brand' : undefined} />
          </button>
          <div className="flex w-24 shrink-0 items-center gap-1">
            <button
              type="button"
              className={control}
              aria-label={muted ? 'Включить звук' : 'Выключить звук'}
              onClick={() => {
                if (session) {
                  toggleTrackMute();
                  return;
                }
                if (audio.current) audio.current.muted = !muted;
                setMuted(!muted);
              }}
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              className={range}
              aria-label="Громкость"
              onChange={(event) => {
                const value = event.currentTarget.valueAsNumber;
                if (session) {
                  setTrackVolume(value);
                  return;
                }
                if (audio.current) {
                  audio.current.volume = value;
                  audio.current.muted = false;
                }
                setMuted(false);
                setVolume(value);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
