import React from 'react';
import { cn } from '../../utils/cn';

type PlaybackSliderProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'min' | 'max' | 'value'
> & {
  max: number;
  value: number;
};

export function formatPlaybackTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function PlaybackSlider({ max, value, className, ...props }: PlaybackSliderProps) {
  const progress = Math.min(1, Math.max(0, value / max)) * 100;
  return (
    <input
      {...props}
      type="range"
      min={0}
      max={max}
      value={value}
      className={cn('playback-slider min-w-0 w-full', className)}
      style={{ '--playback-progress': `${progress}%` } as React.CSSProperties}
    />
  );
}
