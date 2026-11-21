/// <reference types="jest" />
import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import DocumentEditorPage from './DocumentEditorPage';

const mockNavigate = jest.fn();
const mockLogout = jest.fn();
const mockRequestClose = jest.fn(() => true);

jest.mock(
  'react-router-dom',
  () => ({
    useParams: () => ({ id: 'file-id' }),
    useLocation: () => ({ pathname: '/files/file-id/edit' }),
    useNavigate: () => mockNavigate,
    Link: ({
      to,
      children,
      ...props
    }: { to: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }),
  { virtual: true },
);
jest.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: { username: 'tester' },
    firstName: 'Тест',
    logout: mockLogout,
  }),
}));
jest.mock('../hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: jest.fn() }),
}));
jest.mock('../store/authStore', () => ({
  useAuthStore: (select: (state: { accessToken: string }) => string) =>
    select({ accessToken: 'token' }),
}));
jest.mock('../components/SEOHead', () => () => null);
jest.mock('../components/UserSearch', () => ({
  UserSearch: () => <input aria-label="Поиск людей" />,
}));
jest.mock('../components/ui/OfficeFrame', () => {
  const { forwardRef, useEffect, useImperativeHandle } =
    jest.requireActual<typeof import('react')>('react');
  return {
    OfficeFrame: forwardRef(function EditorFixture(
      props: { onRequestClose: () => void; onTitle: (title: string) => void },
      ref,
    ) {
      useImperativeHandle(ref, () => ({
        requestClose: mockRequestClose,
        cancelDeferredClose: () => false,
      }));
      const { onTitle } = props;
      useEffect(() => onTitle('Отчёт.docx'), [onTitle]);
      return <button onClick={props.onRequestClose}>Подтвердить закрытие редактора</button>;
    }),
  };
});

beforeEach(() => {
  mockNavigate.mockClear();
  mockRequestClose.mockClear();
  mockRequestClose.mockReturnValue(true);
  mockLogout.mockClear();
});

test('shows the workspace header and waits for the editor before opening account settings', () => {
  render(<DocumentEditorPage />);
  const header = within(screen.getByRole('banner'));

  expect(header.getByRole('link', { name: 'SharedSpace' })).toHaveAttribute('href', '/dashboard');
  expect(header.getByRole('link', { name: 'К файлу' })).toHaveAttribute('href', '/files/file-id');
  expect(header.getByRole('textbox', { name: 'Поиск людей' })).toBeVisible();
  expect(header.queryByText('Отчёт.docx')).toBeNull();

  fireEvent.click(header.getByRole('button', { name: 'Меню аккаунта' }));
  fireEvent.click(header.getByRole('link', { name: 'Настройки' }));
  expect(mockRequestClose).toHaveBeenCalledTimes(1);
  expect(mockNavigate).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить закрытие редактора' }));
  expect(mockNavigate).toHaveBeenCalledWith('/settings');
});

test('leaves through the existing session before signing out or returning to the file', () => {
  render(<DocumentEditorPage />);
  const header = within(screen.getByRole('banner'));

  fireEvent.click(header.getByRole('link', { name: 'К файлу' }));
  expect(mockNavigate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить закрытие редактора' }));
  expect(mockNavigate).toHaveBeenCalledWith('/files/file-id');

  fireEvent.click(header.getByRole('button', { name: 'Меню аккаунта' }));
  fireEvent.click(header.getByRole('button', { name: 'Выход' }));
  expect(mockLogout).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить закрытие редактора' }));
  expect(mockLogout).toHaveBeenCalledTimes(1);
  expect(mockNavigate).toHaveBeenLastCalledWith('/');
});
