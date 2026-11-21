const messageType = 'sharedspace-office-theme';

export function synchronizeOfficeTheme(
  bridge: string,
  script: string,
  id: unknown,
  signal: AbortSignal,
): Promise<boolean> {
  if (typeof id !== 'string' || !/^theme-[a-z0-9_-]{1,64}$/i.test(id) || signal.aborted)
    return Promise.resolve(false);

  let url: URL;
  try {
    url = new URL(bridge);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin !== new URL(script).origin ||
      url.pathname !== '/sharedspace-theme/index.html' ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      return Promise.resolve(false);
  } catch {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.src = url.href;
    frame.hidden = true;
    frame.title = 'Синхронизация темы редактора';
    frame.referrerPolicy = 'origin';
    if (url.origin !== window.location.origin) {
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    }

    const finish = (success: boolean) => {
      window.clearTimeout(timeout);
      window.removeEventListener('message', receive);
      signal.removeEventListener('abort', abort);
      frame.remove();
      resolve(success);
    };
    const abort = () => finish(false);
    const receive = (event: MessageEvent) => {
      if (
        event.origin === url.origin &&
        event.source === frame.contentWindow &&
        event.data?.type === messageType &&
        event.data.id === id &&
        typeof event.data.ok === 'boolean'
      )
        finish(event.data.ok);
    };
    const timeout = window.setTimeout(abort, 2500);

    frame.addEventListener(
      'load',
      () => {
        frame.contentWindow?.postMessage({ type: messageType, id }, url.origin);
      },
      { once: true },
    );
    frame.addEventListener('error', abort, { once: true });
    window.addEventListener('message', receive);
    signal.addEventListener('abort', abort, { once: true });
    document.body.append(frame);
  });
}
