/// <reference types="jest" />
import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useStorageUsageStore } from '../store/storageUsageStore';
import { Layout } from './Layout';

jest.mock(
  'react-router-dom',
  () => ({
    useLocation: () => ({ pathname: '/dashboard' }),
    useNavigate: () => jest.fn(),
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
  useAuth: () => ({ isAuthenticated: true, user: { username: 'fixture' } }),
}));
jest.mock('../hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: jest.fn() }),
}));
jest.mock('../hooks/useSidebarMenu', () => ({
  isSidebarItemActive: () => true,
  useSidebarMenu: () => ({
    menuItems: [
      {
        label: 'Дашборд',
        path: '/dashboard',
        icon: jest.requireActual('lucide-react').Folder,
      },
    ],
    storageUsed: 0,
    storageQuota: 5,
    shareLinksUsed: 0,
    shareLinksQuota: 100,
    isLoading: false,
  }),
}));
jest.mock('./UserSearch', () => ({ UserSearch: () => null }));
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('./MobileBottomNav', () => ({ MobileBottomNav: () => null }));
jest.mock('./ScrollToTopButton', () => ({ ScrollToTopButton: () => null }));
jest.mock('./ui/StorageUsageModal', () => ({ StorageUsageModal: () => null }));
jest.mock('./ui/ItemProperties', () => ({
  ItemPropertiesProvider: ({ children }: { children: React.ReactNode }) => children,
}));

beforeEach(() => {
  localStorage.clear();
  useStorageUsageStore.getState().close();
});

test('collapses the sidebar, keeps its actions accessible and restores the preference', () => {
  const { unmount } = render(<Layout>Файл</Layout>);
  const sidebar = screen.getByRole('navigation', { name: 'Боковое меню' });
  const collapse = screen.getByRole('button', { name: 'Свернуть боковое меню' });
  expect(collapse).toHaveAttribute('aria-controls', sidebar.id);
  expect(sidebar).toHaveClass('w-64', 'motion-safe:transition-[width]');
  expect(within(sidebar).queryByText('Меню')).toBeNull();
  const links = within(sidebar).getByRole('link', { name: 'Ссылки' });
  const storage = within(sidebar).getByRole('button', { name: 'Использование хранилища' });
  const linksQuota = within(links).getByText('из 100');
  const storageQuota = within(storage).getByText('0.0 ГБ / 5 ГБ');
  expect(linksQuota).toHaveClass('opacity-100');
  expect(storageQuota).toHaveClass('opacity-100');
  fireEvent.click(collapse);

  expect(within(sidebar).getByRole('link', { name: 'Ссылки' })).toBe(links);
  expect(links).toHaveAttribute('href', '/links');
  expect(linksQuota).toHaveClass('opacity-0');
  expect(within(sidebar).getByRole('button', { name: 'Использование хранилища' })).toBe(storage);
  expect(storageQuota).toHaveClass('opacity-0');
  expect(sidebar).toHaveClass('w-16');
  expect(within(sidebar).getByRole('link', { name: 'Дашборд' })).toHaveAttribute(
    'title',
    'Дашборд',
  );
  fireEvent.click(storage);
  expect(useStorageUsageStore.getState().isOpen).toBe(true);

  unmount();
  render(<Layout>Файл</Layout>);
  const expand = screen.getByRole('button', { name: 'Развернуть боковое меню' });
  expect(expand).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(expand);
  expect(screen.getByRole('navigation', { name: 'Боковое меню' })).toHaveClass('w-64');
});

test('a full-viewport preview leaves the sidebar toggle out', () => {
  render(<Layout fillViewport>Предпросмотр</Layout>);
  expect(screen.queryByRole('navigation', { name: 'Боковое меню' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Свернуть боковое меню' })).toBeNull();
});
