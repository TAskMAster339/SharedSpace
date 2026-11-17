import React from 'react';
import { Share2, Star } from 'lucide-react';
import { cn } from '../../utils/cn';

const badge =
  'pointer-events-none absolute grid size-6 place-items-center rounded-theme border border-theme bg-theme-secondary shadow-theme-card motion-safe:transition-[opacity,transform] motion-safe:duration-300';

export function ItemStatusBadges({
  favorite = false,
  shared = false,
  grid = false,
}: {
  favorite?: boolean;
  shared?: boolean;
  grid?: boolean;
}) {
  const position = grid ? 'top-2' : '-top-1.5';
  const sharedOnLeft = grid || favorite;
  return (
    <>
      <span
        role="img"
        aria-label="Есть ссылки общего доступа"
        aria-hidden={!shared}
        title={shared ? 'Есть ссылки общего доступа' : undefined}
        className={cn(
          badge,
          position,
          grid ? 'left-2' : 'left-0',
          !grid &&
            (sharedOnLeft
              ? '-translate-x-1.5'
              : 'translate-x-[calc(var(--badge-preview-width)_-_1.125rem)]'),
          shared ? 'opacity-100' : '-translate-y-1 scale-75 opacity-0',
        )}
      >
        <Share2 aria-hidden="true" size={14} className="text-emerald-700 dark:text-emerald-300" />
      </span>
      <span
        role="img"
        aria-label="В избранном"
        aria-hidden={!favorite}
        title={favorite ? 'В избранном' : undefined}
        className={cn(
          badge,
          position,
          grid ? 'right-2' : '-right-1.5',
          favorite ? 'opacity-100' : '-translate-y-1 scale-75 opacity-0',
        )}
      >
        <Star
          aria-hidden="true"
          size={14}
          className="text-amber-700 dark:text-amber-300"
          fill="currentColor"
        />
      </span>
    </>
  );
}
