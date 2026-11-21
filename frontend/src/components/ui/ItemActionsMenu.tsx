import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MoreVertical, Star, Trash2, Move, Share2, Download, Image, Pencil } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useNavigate } from 'react-router-dom';
import { getDocumentHistory } from '../../api/documents';
import { useAuthStore } from '../../store/authStore';
import { ContextMenu } from './ContextMenu';
import { ItemPropertiesAction, PropertiesTarget } from './ItemProperties';

interface ItemActionsMenuProps {
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onMove?: () => void;
  onShare?: () => void;
  onDownload?: () => void;
  onConvert?: () => void;
  properties?: PropertiesTarget;
  documentId?: string;
  className?: string;
  iconSize?: number;
  contextAnchor?: React.RefObject<HTMLAnchorElement>;
  openMenu?: boolean;
  onCloseMenu?: () => void;
  menuPosition?: { x: number; y: number } | null;
}

const EditDocumentMenuItem: React.FC<{ id: string; onSelect: () => void }> = ({ id, onSelect }) => {
  const [canEdit, setCanEdit] = useState(false);
  const token = useAuthStore((state) => state.accessToken);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    getDocumentHistory(token, id, controller.signal)
      .then((history) => {
        if (!controller.signal.aborted) setCanEdit(history.can_edit);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [id, token]);

  if (!canEdit) return null;

  return (
    <button
      type="button"
      role="menuitem"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect();
        navigate(`/files/${id}/edit`);
      }}
      className="group flex w-full items-center gap-3 px-4 py-3.5 text-base text-theme-secondary transition-colors hover:bg-theme-hover sm:px-3 sm:py-2 sm:text-sm"
    >
      <Pencil size={18} className="group-hover:text-brand transition-colors" aria-hidden="true" />
      Редактировать
    </button>
  );
};

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
  properties,
  documentId,
  className,
  iconSize = 18,
  contextAnchor,
  openMenu,
  onCloseMenu,
  menuPosition,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const getTrigger = () => contextAnchor?.current ?? triggerRef.current;

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

  const hasOtherActions =
    onToggleFavorite || onRename || onDelete || onMove || onShare || onDownload || onConvert;
  if (!hasOtherActions && !properties) return null;

  const handleSelect = (e: React.MouseEvent, action: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    action();
    handleClose();
  };

  const menuItems = (
    <div>
      {isOpen && documentId && <EditDocumentMenuItem id={documentId} onSelect={handleClose} />}
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
          <span className="whitespace-nowrap">Удалить</span>
        </button>
      )}
      {properties && (
        <ItemPropertiesAction
          target={properties}
          separated={!!hasOtherActions}
          focusTarget={getTrigger}
          onSelect={handleClose}
        />
      )}
    </div>
  );

  return (
    <div className={cn('relative inline-flex', className)}>
      {!contextAnchor && (
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
          className={cn(
            'p-2 -m-1 rounded-theme text-theme-muted hover:text-theme-primary hover:bg-theme-hover transition-colors',
            contextAnchor,
          )}
        >
          <MoreVertical size={iconSize} />
        </button>
      )}

      <ContextMenu
        isOpen={isOpen}
        onClose={handleClose}
        position={position}
        width={MENU_WIDTH}
        trigger={contextAnchor || properties ? getTrigger() : null}
      >
        {menuItems}
      </ContextMenu>
    </div>
  );
};
