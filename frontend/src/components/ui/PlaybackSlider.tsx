import React from 'react';
import { cn } from '../../utils/cn';

type PlaybackSliderProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'min' | 'max' | 'value'
> & {
  max: number;
  value: number;
  showPercentage?: boolean;
};

export function formatPlaybackTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function PlaybackSlider({
  max,
  value,
  className,
  showPercentage,
  ...props
}: PlaybackSliderProps) {
  const progress = Math.min(1, Math.max(0, value / max)) * 100;
  const percentage = `${Math.round(progress)}%`;
  const input = (
    <input
      {...props}
      type="range"
      min={0}
      max={max}
      value={value}
      aria-valuetext={showPercentage ? percentage : props['aria-valuetext']}
      className={cn('playback-slider min-w-0 w-full', className)}
      style={{ '--playback-progress': `${progress}%` } as React.CSSProperties}
    />
  );

  if (!showPercentage) return input;

  return (
    <div className="relative flex min-w-0 w-full items-center playback-volume">
      {input}
      <span
        aria-hidden="true"
        className="playback-volume-value pointer-events-none absolute bottom-full left-1/2 z-10 -translate-x-1/2 rounded-theme border border-theme bg-theme-secondary px-2 py-0.5 text-xs tabular-nums text-theme-primary shadow-theme-card"
      >
        {percentage}
      </span>
    </div>
  );
}
