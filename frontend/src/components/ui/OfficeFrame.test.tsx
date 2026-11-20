/// <reference types="jest" />
import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { ApiError } from '../../api/client';
import { startOfficeSession } from '../../api/documents';
import { OfficeFrame } from './OfficeFrame';

jest.mock('../../api/documents', () => ({ startOfficeSession: jest.fn() }));

const start = startOfficeSession as jest.MockedFunction<typeof startOfficeSession>;

beforeEach(() => {
  start.mockReset();
  start.mockRejectedValue(new ApiError('Предпросмотр временно недоступен', 503, 'editor_disabled'));
});

test('preview asks for a read-only session and reopens with the selected theme', async () => {
  const { rerender } = render(
    <OfficeFrame fileId="sheet" token="token" mode="view" theme="light" />,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Предпросмотр временно недоступен');
  const lightRequest = start.mock.calls[0];
  expect(lightRequest.slice(0, 4)).toEqual(['token', 'sheet', 'view', 'light']);
  rerender(<OfficeFrame fileId="sheet" token="token" mode="view" theme="dark" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Предпросмотр временно недоступен');
  expect(lightRequest[4].aborted).toBe(true);
  expect(start.mock.calls[1].slice(0, 4)).toEqual(['token', 'sheet', 'view', 'dark']);
});

test('retries a failed editor configuration without reverting theme', async () => {
  render(<OfficeFrame fileId="slides" token="token" mode="edit" theme="dark" />);
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(start).toHaveBeenCalledTimes(2);
  expect(start.mock.calls[1].slice(0, 4)).toEqual(['token', 'slides', 'edit', 'dark']);
});
