/// <reference types="jest" />
import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { getDocumentHistory, restoreDocumentVersion } from '../../api/documents';
import { DocumentActions } from './DocumentActions';

jest.mock('../../api/documents', () => ({
  getDocumentHistory: jest.fn(),
  getDocumentVersionURL: jest.fn(),
  restoreDocumentVersion: jest.fn(),
}));

jest.mock(
  'react-router-dom',
  () => ({
    Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
      <a href={to}>{children}</a>
    ),
  }),
  { virtual: true },
);

const history = getDocumentHistory as jest.MockedFunction<typeof getDocumentHistory>;
const restore = restoreDocumentVersion as jest.MockedFunction<typeof restoreDocumentVersion>;
const versions = [2, 1].map((number) => ({
  number,
  size: 1024,
  created_at: '2026-11-20T10:00:00Z',
  contributors: [],
}));

beforeEach(() => {
  jest.resetAllMocks();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
});

test('a viewer can open and download history without editing or restoring', async () => {
  history.mockResolvedValue({
    can_edit: false,
    can_restore: false,
    save_pending: false,
    versions,
  });
  render(<DocumentActions id="doc" token="token" onRestored={jest.fn()} />);
  const historyButton = await screen.findByRole('button', { name: 'История версий' });
  fireEvent.click(historyButton);
  await waitFor(() => expect(history).toHaveBeenCalledTimes(2));
  const dialog = screen.getByRole('dialog', { name: 'История версий' });
  expect(within(dialog).getByText('Версия 2 · текущая')).toBeVisible();
  expect(within(dialog).getByRole('button', { name: 'Скачать версию 1' })).toBeVisible();
  expect(within(dialog).queryByRole('button', { name: 'Восстановить' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Редактировать' })).not.toBeInTheDocument();
});

test('an administrator confirms restoration and reloads history', async () => {
  const onRestored = jest.fn();
  const result = { can_edit: true, can_restore: true, save_pending: false, versions };
  history.mockResolvedValue(result);
  restore.mockImplementation(async () => {
    history.mockResolvedValue({
      ...result,
      versions: [{ ...versions[1], number: 3 }, ...versions],
    });
  });
  render(<DocumentActions id="doc" token="token" onRestored={onRestored} />);
  expect(await screen.findByRole('link', { name: 'Редактировать' })).toHaveAttribute(
    'href',
    '/files/doc/edit',
  );
  fireEvent.click(screen.getByRole('button', { name: 'История версий' }));
  await waitFor(() => expect(history).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole('button', { name: 'Восстановить' }));
  expect(restore).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить восстановление' }));
  expect(await screen.findByText('Версия 3 · текущая')).toBeVisible();
  expect(restore).toHaveBeenCalledWith('token', 'doc', 1);
  await waitFor(() => expect(onRestored).toHaveBeenCalledTimes(1));
});
