import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useUploadStore } from '../../store/uploadStore';
import { UploadProgressModal } from './UploadProgressModal';

afterEach(() => {
  useUploadStore.getState().reset();
});

test('can reopen a closed upload panel and retry a failed file', () => {
  const uploads = useUploadStore.getState();
  const [id] = uploads.addTasks([new File([], 'file.txt')], 'folder');
  uploads.updateTask(id, { status: 'error', error: 'Временная ошибка' });

  render(<UploadProgressModal />);
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть', exact: true }));
  expect(screen.queryByText('Временная ошибка')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Ошибок: 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку файла: file.txt' }));
  expect(useUploadStore.getState().tasks[id].status).toBe('pending');
});

test('closes the upload panel completely when no errors can be retried', () => {
  const uploads = useUploadStore.getState();
  const [id] = uploads.addTasks([new File([], 'file.txt')], 'folder');
  uploads.updateTask(id, { status: 'error', error: 'Превышен размер', retryable: false });

  render(<UploadProgressModal />);
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть', exact: true }));

  expect(screen.queryByRole('button', { name: 'Ошибок: 1' })).toBeNull();
});
