import React from 'react';

export function GridItemCaption({ name, size }: { name: string; size: string }) {
  return (
    <div
      className="mt-2 w-full max-w-[160px] text-center"
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <p className="text-xs tabular-nums text-theme-secondary">{size}</p>
      <p className="truncate text-sm font-medium text-theme-primary" title={name}>
        {name}
      </p>
    </div>
  );
}
