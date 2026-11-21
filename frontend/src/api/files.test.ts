import { apiRequest } from './client';
import { convertAndSave, getFilePreviewUrl } from './files';

jest.mock('./client', () => ({
  ...jest.requireActual('./client'),
  apiRequest: jest.fn(),
}));

const request = jest.mocked(apiRequest);

beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(window, 'crypto', {
    configurable: true,
    value: { randomUUID: () => 'request-uuid' },
  });
  request.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

test('polls a conversion job and returns the saved file', async () => {
  jest.useRealTimers();
  request
    .mockResolvedValueOnce({ job_id: 'job', state: 'queued', retry_after: 0 })
    .mockResolvedValueOnce({ job_id: 'job', state: 'running', retry_after: 0 })
    .mockResolvedValueOnce({
      job_id: 'job',
      state: 'succeeded',
      conversion: { result_file_id: 'converted-file' },
    });

  const result = convertAndSave('token', 'source-file', 'webp');
  await expect(result).resolves.toMatchObject({ result_file_id: 'converted-file' });
  expect(request).toHaveBeenNthCalledWith(
    1,
    '/files/source-file/convert?async=true',
    expect.objectContaining({
      headers: { 'Idempotency-Key': expect.any(String) },
      body: '{"target_format":"webp","save":true}',
    }),
  );
  expect(request).toHaveBeenCalledTimes(3);
});

test('stops polling when a preview leaves the page', async () => {
  request.mockResolvedValueOnce({ job_id: 'job', state: 'queued', retry_after: 2 });
  const controller = new AbortController();
  const result = getFilePreviewUrl('token', 'source-file', controller.signal);
  controller.abort();
  jest.advanceTimersByTime(5000);
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(request).toHaveBeenCalledTimes(1);
});
