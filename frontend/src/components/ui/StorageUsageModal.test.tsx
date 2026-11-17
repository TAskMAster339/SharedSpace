/// <reference types="jest" />
import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

test('shows three destinations and includes personal folders omitted from the API list', async () => {
  loadUsage.mockResolvedValue({ ...usage, folder_count: 101, folders: [] });
  render(<StorageUsageModal />);
  await screen.findByText(/Занято 1000.0 Б из 2.0 КБ/);
  expect(screen.getByRole('progressbar', { name: 'Занятое хранилище' })).toHaveAttribute(
    'aria-valuenow',
    '50',
  );
  const rows = screen.getAllByRole('listitem');
  expect(rows).toHaveLength(3);
  for (const [index, name, size, path] of [
    [0, 'Личное хранилище', '400.0 Б', '/directories/root'],
    [1, 'Общие директории', '200.0 Б', '/directories'],
    [2, 'Корзина', '400.0 Б', '/trash'],
  ] as const) {
    expect(within(rows[index]).getByText(size)).toBeVisible();
    expect(within(rows[index]).getByRole('link', { name: `Открыть «${name}»` })).toHaveAttribute(
      'href',
      path,
    );
  }
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Открыть «Личное хранилище»' }));
  expect(useStorageUsageStore.getState().isOpen).toBe(false);
});

test('keeps navigation available for empty categories', async () => {
  loadUsage.mockResolvedValue({ ...usage, used_bytes: 0, trash_bytes: 0, other_files_bytes: 0 });
  render(<StorageUsageModal />);
  await screen.findByRole('list', { name: 'Содержимое хранилища' });
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
  screen
    .getAllByRole('listitem')
    .forEach((row) => expect(within(row).getByText('0 Б')).toBeVisible());
});

test('allows retry after a failed request', async () => {
  loadUsage.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(usage);
  render(<StorageUsageModal />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить');
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  await screen.findByText(/Занято/);
});
