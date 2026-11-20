/// <reference types="jest" />
import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '../api/client';
import { resolveShareLink, startSharedOfficePreview } from '../api/sharelinks';
import SharePage from './SharePage';

jest.mock(
  'react-router-dom',
  () => ({
    useParams: () => ({ token: 'shared-file' }),
    useNavigate: () => jest.fn(),
    Link: 'a',
  }),
  { virtual: true },
);

jest.mock('../components/Layout', () => ({
  useReaderLayout: jest.fn(),
  Layout: ({ children, fillViewport }: { children: React.ReactNode; fillViewport: boolean }) => (
    <div data-testid="share-layout" data-expanded={fillViewport}>
      {children}
    </div>
  ),
}));

jest.mock('../components/SEOHead', () => () => null);

jest.mock('../api/sharelinks', () => ({
  resolveShareLink: jest.fn(),
  startSharedOfficePreview: jest.fn(),
}));

const resolve = jest.mocked(resolveShareLink);
const preview = jest.mocked(startSharedOfficePreview);
const spreadsheet = {
  file_id: 'file',
  filename: 'Budget.xlsx',
  extension: 'xlsx',
  mime_type: 'application/octet-stream',
  size: 100,
  owner_username: 'owner',
  created_at: '2026-01-01T00:00:00Z',
  url: 'https://files.example.test/download',
};

function showSharedFile() {
  return render(<SharePage />);
}

beforeEach(() => {
  resolve.mockReset();
  preview.mockReset();
  preview.mockRejectedValue(new ApiError('Предпросмотр временно недоступен', 503));
});

test('an anonymous recipient can preview a shared spreadsheet and still download it', async () => {
  resolve.mockResolvedValue(spreadsheet);
  showSharedFile();

  expect(await screen.findByRole('alert')).toHaveTextContent('Предпросмотр временно недоступен');
  expect(preview).toHaveBeenCalledWith(
    'shared-file',
    null,
    '',
    'light',
    expect.any(AbortSignal),
    false,
  );
  expect(screen.getByRole('button', { name: 'Скачать файл' })).toBeVisible();
  expect(screen.queryByRole('link', { name: /редактировать/i })).toBeNull();
});

test('a protected link only forwards a password after successful access verification', async () => {
  resolve.mockRejectedValueOnce(new ApiError('Неверный пароль', 403));
  resolve.mockRejectedValueOnce(new ApiError('Неверный пароль', 403));
  resolve.mockResolvedValueOnce({ ...spreadsheet, filename: 'Slides.pptx', extension: 'pptx' });
  showSharedFile();

  const field = await screen.findByPlaceholderText('Пароль');
  fireEvent.change(field, { target: { value: 'wrong' } });
  fireEvent.click(screen.getByRole('button', { name: 'Открыть файл' }));
  expect(await screen.findByText('Неверный пароль')).toBeVisible();
  expect(preview).not.toHaveBeenCalled();

  fireEvent.change(field, { target: { value: 'test пароль +%' } });
  fireEvent.click(screen.getByRole('button', { name: 'Открыть файл' }));
  await waitFor(() =>
    expect(preview).toHaveBeenCalledWith(
      'shared-file',
      null,
      'test пароль +%',
      'light',
      expect.any(AbortSignal),
      false,
    ),
  );
});

test('expanding and collapsing preserves the Office session', async () => {
  resolve.mockResolvedValue(spreadsheet);
  showSharedFile();

  const expand = await screen.findByRole('button', { name: 'Развернуть предпросмотр' });
  expect(expand).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(expand);
  expect(screen.getByTestId('share-layout')).toHaveAttribute('data-expanded', 'true');
  const collapse = screen.getByRole('button', { name: 'Свернуть предпросмотр' });
  expect(collapse).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(collapse);
  expect(screen.getByTestId('share-layout')).toHaveAttribute('data-expanded', 'false');
  expect(preview).toHaveBeenCalledTimes(1);
});
