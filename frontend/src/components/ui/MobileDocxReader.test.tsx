/// <reference types="jest" />
import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { getDocumentHistory } from '../../api/documents';
import { loadDocxReader } from '../../utils/loadDocxReader';
import { MobileDocxReader } from './MobileDocxReader';

jest.mock(
  'react-router-dom',
  () => ({
    Link: ({
      to,
      children,
      ...props
    }: { to: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <a {...props} href={to}>
        {children}
      </a>
    ),
  }),
  { virtual: true },
);
jest.mock('../../api/documents', () => ({ getDocumentHistory: jest.fn() }));
jest.mock('../../utils/loadDocxReader', () => ({
  loadDocxReader: jest.fn(),
  maxReaderSize: 20 * 1024 * 1024,
}));

const load = jest.mocked(loadDocxReader);
const history = jest.mocked(getDocumentHistory);
const props = {
  filename: 'Отчёт.docx',
  size: 1000,
  loadUrl: async () => 'https://files.example.test/report.docx',
  onBack: jest.fn(),
  onStandardPreview: jest.fn(),
};

beforeEach(() => {
  localStorage.setItem('theme', 'light');
  load.mockReset();
  history.mockReset();
});

test('renders text immediately and offers editing only after a permission check', async () => {
  load.mockResolvedValue('<h1>Документ</h1><p>Содержание</p>');
  history.mockResolvedValue({
    can_edit: true,
    can_restore: false,
    save_pending: false,
    versions: [],
  });
  render(<MobileDocxReader {...props} privateFile={{ id: 'id', token: 'access' }} />);

  expect(await screen.findByText('Содержание')).toBeVisible();
  const edit = await screen.findByRole('link', { name: 'Редактировать' });
  expect(edit).toHaveAttribute('href', '/files/id/edit');
  expect(history).toHaveBeenCalledWith('access', 'id', expect.any(AbortSignal));
});

test('a public file stays read-only and an oversized file can use standard preview', async () => {
  render(<MobileDocxReader {...props} size={21 * 1024 * 1024} />);

  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Редактировать' })).toBeNull();
  expect(load).not.toHaveBeenCalled();
  expect(history).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Открыть обычный предпросмотр' }));
  expect(props.onStandardPreview).toHaveBeenCalledTimes(1);
});
