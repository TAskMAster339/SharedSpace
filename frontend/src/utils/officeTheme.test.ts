/// <reference types="jest" />
import { synchronizeOfficeTheme } from './officeTheme';

const server = 'https://office.example.test';
const script = server + '/web-apps/apps/api/documents/api.js';
const bridge = server + '/sharedspace-theme/index.html';
const id = 'theme-sharedspace-dark';
const ack = { type: 'sharedspace-office-theme', id, ok: true };

test('accepts the reply only from the expected origin and iframe', async () => {
  const result = synchronizeOfficeTheme(bridge, script, id, new AbortController().signal);
  const iframe = document.querySelector('iframe');
  const source = iframe?.contentWindow;
  expect(source).not.toBeNull();

  window.dispatchEvent(
    new MessageEvent('message', { origin: 'https://evil.test', source, data: ack }),
  );
  window.dispatchEvent(new MessageEvent('message', { origin: server, source: window, data: ack }));
  expect(document.querySelector('iframe')).toBe(iframe);

  window.dispatchEvent(new MessageEvent('message', { origin: server, source, data: ack }));
  await expect(result).resolves.toBe(true);
  expect(document.querySelector('iframe')).toBeNull();
});

test('rejects unrelated URLs and cancels pending synchronization on abort', async () => {
  const controller = new AbortController();
  await expect(
    synchronizeOfficeTheme(
      'https://evil.test/sharedspace-theme/index.html',
      script,
      id,
      controller.signal,
    ),
  ).resolves.toBe(false);

  const result = synchronizeOfficeTheme(bridge, script, id, controller.signal);
  controller.abort();
  await expect(result).resolves.toBe(false);
  expect(document.querySelector('iframe')).toBeNull();
});
