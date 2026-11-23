import type { AuthUser } from '../api/auth';
import { NonRetryableUploadError, uploadSingleFile, FileUploadResponse } from '../api/files';
import { useToastStore } from '../hooks/useToast';
import { useAuthStore } from '../store/authStore';
import { useUploadStore } from '../store/uploadStore';
import { startUploadManager, stopUploadManager } from './uploadManager';

jest.mock('../api/files', () => ({
  ...jest.requireActual('../api/files'),
  uploadSingleFile: jest.fn(),
}));

const upload = jest.mocked(uploadSingleFile);
const files = (...names: string[]) => names.map((name) => new File(['content'], name));
const signIn = (id: string) =>
  useAuthStore.setState({ user: { id } as AuthUser, accessToken: id, isAuthenticated: true });
const requests: Array<{
  signal?: AbortSignal;
  resolve: (result: FileUploadResponse) => void;
  reject: (error: Error) => void;
}> = [];

beforeEach(() => {
  requests.length = 0;
  useUploadStore.getState().reset();
  useToastStore.setState({ toasts: [] });
  signIn('first');
  upload
    .mockReset()
    .mockImplementation(
      (_token, _folder, _file, _progress, signal) =>
        new Promise((resolve, reject) => requests.push({ signal, resolve, reject })),
    );
  startUploadManager();
});

afterEach(() => {
  stopUploadManager();
});

test('clears active and pending files on logout and starts new uploads after login', async () => {
  useUploadStore.getState().addTasks(files('a', 'b', 'c', 'waiting'), 'first-folder');
  expect(upload).toHaveBeenCalledTimes(3);

  await useAuthStore.getState().logout();
  expect(requests.every(({ signal }) => signal?.aborted)).toBe(true);
  expect(useUploadStore.getState().order).toEqual([]);

  signIn('second');
  useUploadStore.getState().addTasks(files('new'), 'second-folder');
  expect(upload).toHaveBeenCalledTimes(4);
  expect(upload.mock.calls[3].slice(0, 3)).toEqual([
    'second',
    'second-folder',
    expect.objectContaining({ name: 'new' }),
  ]);
});

test('clears retryable tasks on account switch and ignores a late upload result', async () => {
  const ids = useUploadStore.getState().addTasks(files('failed', 'late'), 'first-folder');
  requests[0].reject(new Error('Network failure'));
  await Promise.resolve();
  expect(useUploadStore.getState().tasks[ids[0]].status).toBe('error');

  signIn('second');
  useUploadStore.getState().retryFailed(ids[0]);
  requests[1].resolve({ id: 'late' } as FileUploadResponse);
  await Promise.resolve();

  expect(upload).toHaveBeenCalledTimes(2);
  expect(useUploadStore.getState().order).toEqual([]);
  expect(useToastStore.getState().toasts).toEqual([]);
});

test('stopping the manager with valid auth does not dispatch a waiting upload', async () => {
  useUploadStore.getState().addTasks(files('a', 'b', 'c', 'waiting'), 'folder');
  stopUploadManager();
  requests[0].reject(new DOMException('Aborted', 'AbortError'));
  await Promise.resolve();

  expect(upload).toHaveBeenCalledTimes(3);
  expect(useUploadStore.getState().order).toEqual([]);
});

test('offers individual retries for temporary errors but skips permanent errors', async () => {
  const ids = useUploadStore.getState().addTasks(files('network', 'too-large'), 'folder');
  requests[0].reject(new Error('Network failure'));
  requests[1].reject(new NonRetryableUploadError('Too large'));
  await Promise.resolve();

  useUploadStore.getState().retryFailed(ids[1]);
  expect(upload).toHaveBeenCalledTimes(2);
  useUploadStore.getState().retryFailed(ids[0]);
  expect(upload).toHaveBeenCalledTimes(3);
  expect(upload.mock.calls[2][2].name).toBe('network');
});
