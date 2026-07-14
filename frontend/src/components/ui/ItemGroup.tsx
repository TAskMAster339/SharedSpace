import React, { RefObject } from 'react';
import { ViewMode } from './ViewToggle';

interface ItemGroupProps {
  title: string;
  viewMode: ViewMode;
  children: React.ReactNode;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  sentinelRef?: RefObject<HTMLDivElement | null>;
}

export const ItemGroup: React.FC<ItemGroupProps> = ({
  title,
  viewMode,
  children,
  hasMore,
  isLoadingMore,
  sentinelRef,
}) => {
  return (
    <div className="bg-theme-secondary border border-theme rounded-theme-lg p-4 shadow-theme-card">
      <h2 className="text-sm font-medium text-theme-secondary mb-3">{title}</h2>
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {children}
        </div>
      ) : (
        <div className="space-y-1">{children}</div>
      )}
      {hasMore && (
        <div className="mt-3 flex items-center justify-center gap-3">
          {isLoadingMore && (
            <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          )}
          {sentinelRef && <div ref={sentinelRef} className="h-2" />}
        </div>
      )}
    </div>
  );
};
