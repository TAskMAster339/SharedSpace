/// <reference types="jest" />
import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getStorageUsage, StorageUsage } from '../../api/users';
import { useStorageUsageStore } from '../../store/storageUsageStore';
import { StorageUsageModal } from './StorageUsageModal';

jest.mock('../../api/users', () => ({ getStorageUsage: jest.fn() }));
jest.mock('../../store/authStore', () => ({
  useAuthStore: (selector: (state: { accessToken: string }) => unknown) =>
    selector({ accessToken: 'token' }),
}));
jest.mock(
  'react-router-dom',
  () => ({
    Link: ({
      to,
      onClick,
      children,
      'aria-label': ariaLabel,
    }: {
      to: string;
      onClick?: () => void;
      children: React.ReactNode;
      'aria-label'?: string;
    }) => (
      <a
        href={to}
        aria-label={ariaLabel}
        onClick={(event) => {
          event.preventDefault();
          onClick?.();
        }}
      >
        {children}
      </a>
    ),
  }),
  { virtual: true },
);

const loadUsage = getStorageUsage as jest.MockedFunction<typeof getStorageUsage>;
const usage: StorageUsage = {
  used_bytes: 1000,
  quota_bytes: 2000,
  trash_bytes: 400,
  root_files_bytes: 100,
  other_files_bytes: 200,
  root_id: 'root',
  folder_count: 1,
  folders: [{ id: 'photos', name: 'Фотографии', size_bytes: 300 }],
};
beforeEach(() => {
  loadUsage.mockReset();
  useStorageUsageStore.setState({ isOpen: true });
});

test('includes trash in the total and opens a folder from the breakdown', async () => {
  loadUsage.mockResolvedValue(usage);
  render(<StorageUsageModal />);
  await screen.findByText(/Занято 1000.0 Б из 2.0 КБ/);
  expect(screen.getByRole('progressbar', { name: 'Занятое хранилище' })).toHaveAttribute(
    'aria-valuenow',
    '50',
  );
  expect(screen.getByText('Корзина')).toBeVisible();
  const openFolder = screen.getByRole('link', { name: 'Открыть «Фотографии»' });
  expect(openFolder).toHaveAttribute('href', '/directories/photos');
  fireEvent.click(openFolder);
  expect(useStorageUsageStore.getState().isOpen).toBe(false);
});

test('sorts folders, trash and file groups by size and by name', async () => {
  loadUsage.mockResolvedValue({
    ...usage,
    folders: [
      { id: 'january', name: 'Январь', size_bytes: 300 },
      { id: 'archive', name: 'Архив', size_bytes: 700 },
    ],
    folder_count: 2,
  });
  render(<StorageUsageModal />);
  await screen.findByText(/Занято/);
  const bySize = ['Архив', 'Корзина', 'Январь', 'Ваши файлы в других папках', 'Файлы в корне'];
  screen
    .getAllByRole('listitem')
    .forEach((row, index) => expect(row).toHaveTextContent(bySize[index]));
  fireEvent.change(screen.getByRole('combobox', { name: 'Сортировка содержимого' }), {
    target: { value: 'name' },
  });
  const byName = ['Архив', 'Ваши файлы в других папках', 'Корзина', 'Файлы в корне', 'Январь'];
  screen
    .getAllByRole('listitem')
    .forEach((row, index) => expect(row).toHaveTextContent(byName[index]));
  await waitFor(() =>
    expect(loadUsage).toHaveBeenLastCalledWith('token', 'name', expect.anything()),
  );
});

test('allows retry after a failed request', async () => {
  loadUsage.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(usage);
  render(<StorageUsageModal />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить');
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  await screen.findByText(/Занято/);
});
