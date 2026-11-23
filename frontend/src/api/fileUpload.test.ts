import { setAuthHandlers } from './client';
import { NonRetryableUploadError, uploadSingleFile } from './files';

class UploadRequest extends EventTarget {
  static instances: UploadRequest[] = [];
  upload = new EventTarget();
  status = 0;
  responseText = '';
  authorization?: string;

  constructor() {
    super();
    UploadRequest.instances.push(this);
  }

  open() {}

  send() {}

  abort() {
    this.dispatchEvent(new Event('abort'));
  }

  setRequestHeader(name: string, value: string) {
    if (name === 'Authorization') this.authorization = value;
  }

  respond(status: number, body: string) {
    this.status = status;
    this.responseText = body;
    this.dispatchEvent(new Event('load'));
  }
}

const originalXHR = window.XMLHttpRequest;
const refresh = jest.fn<Promise<string>, []>();
const onAuthFailure = jest.fn();
const start = (signal?: AbortSignal) =>
  uploadSingleFile('expired', 'folder', new File(['content'], 'file.txt'), jest.fn(), signal);

beforeEach(() => {
  UploadRequest.instances = [];
  window.XMLHttpRequest = UploadRequest as unknown as typeof XMLHttpRequest;
  refresh.mockReset();
  onAuthFailure.mockReset();
  setAuthHandlers({
    refresh,
    onAuthFailure,
    getRefreshToken: () => 'refresh-token',
    getAccessToken: () => 'expired',
    getSessionVersion: () => 0,
  });
});

afterEach(() => {
  window.XMLHttpRequest = originalXHR;
});

test.each([
  ['{"error":"Лимит сервера"}', 'Лимит сервера'],
  ['<html>Request Entity Too Large</html>', 'Размер файла не должен превышать 512 МиБ'],
])('rejects a 413 as non-retryable for response %s', async (body, message) => {
  const result = start();
  UploadRequest.instances[0].respond(413, body);
  await expect(result).rejects.toBeInstanceOf(NonRetryableUploadError);
  await expect(result).rejects.toThrow(message);
});

test('shares token refresh across uploads and retries each upload at most once', async () => {
  refresh.mockResolvedValue('fresh');
  const first = start();
  const second = start();
  UploadRequest.instances[0].respond(401, '{}');
  UploadRequest.instances[1].respond(401, '{}');

  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(UploadRequest.instances.map((request) => request.authorization)).toEqual([
    'Bearer expired',
    'Bearer expired',
    'Bearer fresh',
    'Bearer fresh',
  ]);

  UploadRequest.instances[2].respond(201, '{"files":[{"id":"uploaded"}]}');
  UploadRequest.instances[3].respond(401, '{}');
  await expect(first).resolves.toMatchObject({ id: 'uploaded' });
  await expect(second).rejects.toMatchObject({ status: 401 });
  expect(UploadRequest.instances).toHaveLength(4);
});

test('does not resend the upload if the session is cancelled during refresh', async () => {
  let resolveRefresh!: (token: string) => void;
  refresh.mockReturnValue(new Promise((resolve) => (resolveRefresh = resolve)));
  const controller = new AbortController();
  const result = start(controller.signal);
  UploadRequest.instances[0].respond(401, '{}');
  await Promise.resolve();
  expect(refresh).toHaveBeenCalledTimes(1);

  controller.abort();
  resolveRefresh('fresh');
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(UploadRequest.instances).toHaveLength(1);
});
