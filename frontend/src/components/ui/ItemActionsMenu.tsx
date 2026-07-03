import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MoreVertical, Star, Trash2, Move, Share2, Download, Image, Pencil } from 'lucide-react';
import { cn } from '../../utils/cn';
import { ContextMenu } from './ContextMenu';

interface ItemActionsMenuProps {
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onMove?: () => void;
  onShare?: () => void;
  onDownload?: () => void;
  onConvert?: () => void;
  className?: string;
  iconSize?: number;
  openMenu?: boolean;
  onCloseMenu?: () => void;
  menuPosition?: { x: number; y: number } | null;
}

const MENU_WIDTH = 216;
const GAP = 4;

export const ItemActionsMenu: React.FC<ItemActionsMenuProps> = ({
  isFavorite = false,
  onToggleFavorite,
  onRename,
  onDelete,
  onMove,
  onShare,
  onDownload,
  onConvert,
  className,
  iconSize = 18,
  openMenu,
  onCloseMenu,
  menuPosition,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    setIsOpen(true);
  }, [openMenu]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPosition({ x: rect.right - MENU_WIDTH, y: rect.bottom + GAP });
  }, []);

  const handleOpen = () => {
    if (menuPosition) {
      setPosition(menuPosition);
    } else {
      updatePosition();
    }
    setIsOpen((prev) => !prev);
  };

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setPosition(null);
    onCloseMenu?.();
  }, [onCloseMenu]);

  useEffect(() => {
    if (menuPosition && isOpen) {
      setPosition(menuPosition);
    }
  }, [menuPosition, isOpen]);

  if (
    !onToggleFavorite &&
    !onRename &&
    !onDelete &&
    !onMove &&
    !onShare &&
    !onDownload &&
    !onConvert
  )
    return null;

  const handleSelect = (e: React.MouseEvent, action: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    action();
    handleClose();
  };

  const menuItems = (
    <div>
      {onDownload && (
        <button
          type="button"
          role="menuitem"
          onClick={(e) => handleSelect(e, onDownload)}
          className="group flex items-center gap-3 w-full px-4 py-3.5 text-base text-theme-secondary hover:bg-theme-hover transition-colors sm:px-3 sm:py-2 sm:text-sm"
        >
          <Download size={18} className="group-hover:text-brand transition-colors" />
          Скачать файл
        </button>
      )}
      {onConvert && (
        <button
          type="button"
          role="menuitem"
          onClick={(e) => handleSelect(e, onConvert)}
          className="group flex items-center gap-3 w-full px-4 py-3.5 text-base text-theme-secondary hover:bg-theme-hover transition-colors sm:px-3 sm:py-2 sm:text-sm"
        >
          <Image size={18} className="group-hover:text-purple-500 transition-colors" />
          Конвертировать
        </button>
      )}
      {(onDownload || onConvert) &&
        (onRename || onShare || onMove || onToggleFavorite || onDelete) && (
          <div className="border-t border-theme my-1" />
        )}
      {onShare && (
        <button
          type="button"
          role="menuitem"
          onClick={(e) => handleSelect(e, onShare)}
          className="group flex items-center gap-3 w-full px-4 py-3.5 text-base text-theme-secondary hover:bg-theme-hover transition-colors sm:px-3 sm:py-2 sm:text-sm"
        >
          <Share2 size={18} className="group-hover:text-green-500 transition-colors" />
          Поделиться ссылкой
        </button>
      )}
      {onRename && (
        <button
          type="button"
          role="menuitem"
          onClick={(e) => handleSelect(e, onRename)}
          className="group flex items-center gap-3 w-full px-4 py-3.5 text-base text-theme-secondary hover:bg-theme-hover transition-colors sm:px-3 sm:py-2 sm:text-sm"
        >
          <Pencil size={18} className="group-hover:text-brand transition-colors" />
          Переименовать
        </button>
      )}
      {onMove && (
        <button
          type="button"
          role="menuitem"
          onClick={(e) => handleSelect(e, onMove)}
          className="group flex items-center gap-3 w-full px-4 py-3.5 text-base text-theme-secondary hover:bg-theme-hover transition-colors sm:px-3 sm:py-2 sm:text-sm"
        >
          <Move size={18} className="group-hover:text-brand transition-colors" />
          Переместить
        </button>
      )}
      {onToggleFavorite && (
        <button
          type="button"
          role="menuitem"
          onClick={(e) => handleSelect(e, onToggleFavorite)}
          className="group flex items-center gap-3 w-full px-4 py-3.5 text-base text-theme-secondary hover:bg-theme-hover transition-colors sm:px-3 sm:py-2 sm:text-sm"
        >
          <Star
            size={18}
            fill={isFavorite ? 'currentColor' : 'transparent'}
            className={cn(
              'transition-[fill,color] duration-200',
              isFavorite ? 'text-yellow-400' : 'text-theme-muted group-hover:fill-transparent',
              isFavorite ? '' : 'group-hover:text-yellow-400',
            )}
          />
          {isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          role="menuitem"
          onClick={(e) => handleSelect(e, onDelete)}
          className="group flex items-center gap-3 w-full px-4 py-3.5 text-base text-theme-secondary hover:bg-theme-hover transition-colors sm:px-3 sm:py-2 sm:text-sm"
        >
          <Trash2 size={18} className="group-hover:text-red-500 transition-colors" />
          Переместить в корзину
        </button>
      )}
    </div>
  );

  return (
    <div className={cn('relative inline-flex', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Открыть меню действий"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!menuPosition) updatePosition();
          setIsOpen((prev) => !prev);
        }}
        className="p-2 -m-1 rounded-theme-sm text-theme-muted hover:text-theme-primary hover:bg-theme-hover transition-colors"
      >
        <MoreVertical size={iconSize} />
      </button>

      <ContextMenu isOpen={isOpen} onClose={handleClose} position={position} width={MENU_WIDTH}>
        {menuItems}
      </ContextMenu>
    </div>
  );
};
