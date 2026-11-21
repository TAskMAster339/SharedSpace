import { act, renderHook } from '@testing-library/react';
import { convertAndDownload, convertAndSave, type ConversionResponse } from '../api/files';
import type { AuthUser } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import { startFileConversion, useOnFileConverted } from './useFileConversion';
import { useToastStore } from './useToast';

jest.mock('../api/files');

const account = { id: 'user' } as AuthUser;

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({
    user: account,
    accessToken: 'token',
    refreshUser: jest.fn().mockResolvedValue(undefined),
  });
  useToastStore.setState({ toasts: [] });
});

test('closing the queue notification keeps the job running and refreshes the mounted page', async () => {
  const saved: ConversionResponse = {
    id: 'conversion',
    source_file_id: 'source',
    result_file_id: 'new-file',
    source_format: 'png',
    target_format: 'webp',
    created_by: 'user',
    created_at: '2026-11-21',
  };
  let finish!: (result: ConversionResponse) => void;
  jest.mocked(convertAndSave).mockImplementation(
    (_token, _id, _format, options) =>
      new Promise((resolve) => {
        options?.onAccepted?.();
        finish = resolve;
      }),
  );

  const origin = jest.fn();
  const { unmount } = renderHook(() => useOnFileConverted(origin));
  const job = startFileConversion('source', 'picture.png', 'webp', 'save');
  const [notice] = useToastStore.getState().toasts;
  expect(notice).toMatchObject({
    variant: 'pending',
    message: expect.stringContaining('в очереди'),
  });
  useToastStore.getState().removeToast(notice.id);
  unmount();

  const destination = jest.fn();
  renderHook(() => useOnFileConverted(destination));
  await act(async () => {
    finish(saved);
    await job;
  });

  expect(origin).not.toHaveBeenCalled();
  expect(destination).toHaveBeenCalledTimes(1);
  expect(destination).toHaveBeenCalledWith(saved, expect.any(AbortSignal));
  expect(useAuthStore.getState().refreshUser).toHaveBeenCalledTimes(1);
  expect(useToastStore.getState().toasts).toEqual([]);
});

test('downloads the completed conversion and removes its notification', async () => {
  jest.mocked(convertAndDownload).mockImplementation(async (_token, _id, _format, options) => {
    options?.onAccepted?.();
    return { download_url: 'http://localhost/output.jpg', filename: 'output.jpg' };
  });

  const linkClick = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    expect(this.download).toBe('output.jpg');
    expect(this.href).toBe('http://localhost/output.jpg');
  });
  try {
    await startFileConversion('source', 'picture.png', 'jpg', 'download');
    expect(linkClick).toHaveBeenCalledTimes(1);
    expect(useToastStore.getState().toasts).toEqual([]);
  } finally {
    linkClick.mockRestore();
  }
});
