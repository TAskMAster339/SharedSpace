import React from 'react';
import { Repeat, Repeat1, Shuffle, Volume2, VolumeX } from 'lucide-react';
import {
  setTrackVolume,
  toggleTrackMute,
  toggleTrackRepeat,
  toggleTrackShuffle,
  useAudioPlayback,
} from '../../store/audioPlaybackStore';
import { cn } from '../../utils/cn';

import { PlaybackSlider } from './PlaybackSlider';

export const playbackControl =
  'inline-grid size-11 shrink-0 place-items-center rounded-full text-theme-secondary transition-colors hover:bg-theme-hover hover:text-theme-primary focus-visible:outline focus-visible:outline-brand disabled:opacity-40';

export function PlaybackModes({ hasPlaylist }: { hasPlaylist: boolean }) {
  const repeat = useAudioPlayback((state) => state.repeat);
  const shuffle = useAudioPlayback((state) => state.shuffle);
  const repeatLabel =
    repeat === 'playlist'
      ? 'Повторяется плейлист. Включить повтор трека'
      : repeat === 'track'
        ? 'Повторяется трек. Выключить повтор'
        : hasPlaylist
          ? 'Повтор плейлиста'
          : 'Повтор трека';
  const RepeatIcon = repeat === 'track' ? Repeat1 : Repeat;
  return (
    <div className="flex items-center">
      {hasPlaylist && (
        <button
          type="button"
          className={cn(playbackControl, shuffle && 'bg-brand-light text-brand')}
          aria-label="Перемешать треки"
          title="Перемешать треки"
          aria-pressed={shuffle}
          onClick={toggleTrackShuffle}
        >
          <Shuffle size={19} />
        </button>
      )}
      <button
        type="button"
        className={cn(playbackControl, repeat !== 'off' && 'bg-brand-light text-brand')}
        aria-label={repeatLabel}
        title={repeatLabel}
        aria-pressed={repeat !== 'off'}
        onClick={() => toggleTrackRepeat(hasPlaylist)}
      >
        <RepeatIcon size={20} />
      </button>
    </div>
  );
}

export function PlaybackVolume() {
  const volume = useAudioPlayback((state) => state.volume);
  const muted = useAudioPlayback((state) => state.muted);
  const label = muted ? 'Включить звук' : 'Выключить звук';
  return (
    <div className="flex w-28 shrink-0 items-center gap-1">
      <button
        type="button"
        className={playbackControl}
        aria-label={label}
        title={label}
        onClick={toggleTrackMute}
      >
        {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
      </button>
      <PlaybackSlider
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        aria-label="Громкость"
        showPercentage
        onChange={(event) => setTrackVolume(event.currentTarget.valueAsNumber)}
      />
    </div>
  );
}
