import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useUploadStore } from '../../store/uploadStore';
import { ConfirmModal } from './ConfirmModal';
import { Modal } from './Modal';
import { UploadProgressModal } from './UploadProgressModal';

afterEach(() => {
  useUploadStore.getState().reset();
});

test('blocks right-click on modal content, then restores page menus', () => {
  const onPageContextMenu = jest.fn();
  const onClose = jest.fn();
  const page = (isOpen: boolean) => (
    <div onContextMenu={onPageContextMenu}>
      <button>Page action</button>
      <Modal isOpen={isOpen} onClose={onClose} title="New folder">
        <input aria-label="Folder name" />
      </Modal>
    </div>
  );
  const { rerender } = render(page(true));

  expect(fireEvent.contextMenu(screen.getByRole('textbox'))).toBe(false);
  expect(onPageContextMenu).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();

  rerender(page(false));
  fireEvent.contextMenu(screen.getByRole('button', { name: 'Page action' }));
  expect(onPageContextMenu).toHaveBeenCalledTimes(1);
});

test('blocks right-click in confirmation dialogs', () => {
  const onPageContextMenu = jest.fn();
  render(
    <div onContextMenu={onPageContextMenu}>
      <ConfirmModal isOpen title="Confirm" onClose={jest.fn()} onConfirm={jest.fn()} />
    </div>,
  );

  expect(fireEvent.contextMenu(screen.getByRole('button', { name: 'Подтвердить' }))).toBe(false);
  expect(onPageContextMenu).not.toHaveBeenCalled();
});

test('blocks right-click in the upload dialog and removes only the selected file', () => {
  const uploads = useUploadStore.getState();
  const ids = uploads.addTasks([new File([], 'done.txt'), new File([], 'failed.txt')], 'folder');
  uploads.updateTask(ids[0], { status: 'success', progress: 100 });
  uploads.updateTask(ids[1], { status: 'error', retryable: false, error: 'Лимит файла' });

  const onPageContextMenu = jest.fn();
  render(
    <div onContextMenu={onPageContextMenu}>
      <UploadProgressModal />
    </div>,
  );

  const remove = screen.getByRole('button', { name: 'Убрать из списка: done.txt' });
  expect(fireEvent.contextMenu(remove)).toBe(false);
  expect(onPageContextMenu).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: /Повторить/ })).toBeNull();

  fireEvent.click(remove);
  expect(screen.queryByText('done.txt')).toBeNull();
  expect(screen.getByText('Лимит файла')).toBeTruthy();
});
