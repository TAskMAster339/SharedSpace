/// <reference types="jest" />
import { ApiError } from '../api/client';
import { releaseOfficeLease, renewOfficeLease } from '../api/documents';
import { trackOfficeLease } from './officeLease';

jest.mock('../api/documents', () => ({
  renewOfficeLease: jest.fn(),
  releaseOfficeLease: jest.fn(),
}));

const renew = jest.mocked(renewOfficeLease);
const release = jest.mocked(releaseOfficeLease);

beforeEach(() => {
  jest.useFakeTimers();
  renew.mockReset();
  renew.mockResolvedValue(undefined);
  release.mockReset();
  release.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

test('renews a lease and releases it exactly once on navigation', async () => {
  const close = trackOfficeLease('lease', jest.fn());
  jest.advanceTimersByTime(60_000);
  expect(renew).toHaveBeenCalledWith('lease', expect.any(AbortSignal));
  await new Promise<void>((resolve) => jest.requireActual('timers').setImmediate(resolve));
  close();
  close();
  jest.advanceTimersByTime(60_000);
  expect(release).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledWith('lease');
  expect(renew).toHaveBeenCalledTimes(1);
});

test('keeps the lease when the page enters the back-forward cache', () => {
  const close = trackOfficeLease('lease', jest.fn());
  const pagehide = new Event('pagehide');
  Object.defineProperty(pagehide, 'persisted', { value: true });
  window.dispatchEvent(pagehide);
  expect(release).not.toHaveBeenCalled();
  close();
  expect(release).toHaveBeenCalledTimes(1);
});

test('reports an expired lease without repeatedly renewing it', async () => {
  renew.mockRejectedValue(new ApiError('expired', 410, 'office_lease_expired'));
  const expired = jest.fn();
  trackOfficeLease('lease', expired);
  jest.advanceTimersByTime(60_000);
  await new Promise<void>((resolve) => jest.requireActual('timers').setImmediate(resolve));
  expect(expired).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledWith('lease');
  jest.advanceTimersByTime(300_000);
  expect(renew).toHaveBeenCalledTimes(1);
});

test('expires a lease after repeated network failures', async () => {
  renew.mockRejectedValue(new Error('Network'));
  const expired = jest.fn();
  trackOfficeLease('lease', expired);
  for (let minute = 0; minute < 5; minute += 1) {
    jest.advanceTimersByTime(60_000);
    await new Promise<void>((resolve) => jest.requireActual('timers').setImmediate(resolve));
  }
  expect(expired).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledWith('lease');
});
