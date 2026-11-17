/// <reference types="jest" />
import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ApiError } from '../../api/client';
import { getDirectoryById } from '../../api/directories';
import { FileMetadata, getFileMetadata } from '../../api/files';
import { FileItem } from './FileItem';
import { FolderGridItem } from './FolderGridItem';
import { ItemPropertiesProvider } from './ItemProperties';

jest.mock('../../api/directories', () => ({ getDirectoryById: jest.fn() }));
jest.mock('../../api/files', () => ({ getFileMetadata: jest.fn() }));
jest.mock('../../store/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ accessToken: 'token', user: { id: 'me' } }),
}));
jest.mock('./FilePreview', () => ({ FilePreview: () => null }));
jest.mock(
  'react-router-dom',
  () => ({
    Link: ({
      to,
      children,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
    useLocation: () => ({ key: 'view' }),
  }),
  { virtual: true },
);

const loadFile = getFileMetadata as jest.MockedFunction<typeof getFileMetadata>;
const loadDirectory = getDirectoryById as jest.MockedFunction<typeof getDirectoryById>;
const date = '2025-02-13T08:20:00Z';
const file: FileMetadata = {
  id: 'file',
  filename: 'README',
  extension: '',
  mime_type: 'text/plain',
  size: 0,
  directory_id: 'dir',
  owner_id: 'someone',
  owner_username: 'alice',
  created_at: date,
  updated_at: date,
};

beforeEach(() => {
  loadFile.mockReset();
  loadDirectory.mockReset();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  });
  // jsdom does not implement the native dialog methods. Escape and focus return are exercised in the browser.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

function view() {
  render(
    <ItemPropertiesProvider>
      <FileItem id="file" name="Файл" date="" size="" type="text" to="/file" showProperties />
      <FolderGridItem id="dir" name="Пустая папка" to="/dir" showProperties />
    </ItemPropertiesProvider>,
  );
}

function selectProperties() {
  fireEvent.click(screen.getByRole('menuitem', { name: 'Свойства' }));
}

test('opens by the three-dot menu and shows file metadata in read-only view', async () => {
  loadFile.mockResolvedValue(file);
  view();
  fireEvent.click(screen.getAllByRole('button', { name: 'Открыть меню действий' })[0]);
  selectProperties();
  const dialog = screen.getByRole('dialog', { name: 'Свойства' });
  expect(within(dialog).getByRole('status')).toBeVisible();
  expect(await within(dialog).findByText('README')).toBeVisible();
  expect(within(dialog).getByText('0 Б')).toBeVisible();
  expect(within(dialog).getByText('text/plain')).toBeVisible();
  expect(within(dialog).getByText('alice')).toBeVisible();
  expect(within(dialog).queryByText('Расширение')).not.toBeInTheDocument();
  const localDateTime = new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(date));
  expect(within(dialog).getAllByText(localDateTime)).toHaveLength(2);
  expect(loadFile).toHaveBeenCalledWith('token', 'file', expect.any(AbortSignal));
});

test('opens a folder by right click and discards a response received after closing', async () => {
  let finishFile = (_result: FileMetadata) => {};
  loadFile.mockReturnValue(new Promise((resolve) => (finishFile = resolve)));
  loadDirectory.mockResolvedValue({
    id: 'dir',
    name: 'Архив',
    owner_id: 'me',
    parent_id: 'root',
    size_bytes: 0,
    type: 'regular',
    created_at: date,
    updated_at: date,
  });
  view();
  fireEvent.contextMenu(screen.getByRole('link', { name: /Файл/ }));
  selectProperties();
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
  expect(loadFile.mock.calls[0][2]?.aborted).toBe(true);
  fireEvent.contextMenu(screen.getByRole('link', { name: /Пустая папка/ }));
  selectProperties();
  await act(async () => finishFile(file));
  expect(await screen.findByText('Архив')).toBeVisible();
  expect(screen.getByText('0 Б')).toBeVisible();
  expect(screen.getByText('Вы')).toBeVisible();
  expect(screen.queryByText('README')).not.toBeInTheDocument();
});

test('allows retry after a network failure', async () => {
  loadFile.mockRejectedValueOnce(new TypeError('offline')).mockResolvedValue(file);
  view();
  fireEvent.contextMenu(screen.getByRole('link', { name: /Файл/ }));
  selectProperties();
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить свойства.');
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  expect(await screen.findByText('README')).toBeVisible();
});

test.each([
  [403, 'У вас нет доступа к этому объекту.'],
  [404, 'Объект больше недоступен.'],
])('shows HTTP %i without offering retry', async (status, message) => {
  loadFile.mockRejectedValue(new ApiError('', status));
  view();
  fireEvent.contextMenu(screen.getByRole('link', { name: /Файл/ }));
  selectProperties();
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(screen.queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument();
});
