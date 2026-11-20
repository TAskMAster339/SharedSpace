export const maxReaderSize = 20 * 1024 * 1024;

async function readDocx(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal });
  if (
    !response.ok ||
    !response.body ||
    Number(response.headers.get('Content-Length')) > maxReaderSize
  ) {
    await response.body?.cancel().catch(() => {});
    throw new Error('Не удалось получить документ');
  }
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxReaderSize) throw new Error('Документ слишком большой для мобильного чтения');
      parts.push(value);
    }
    return await new Blob(parts).arrayBuffer();
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function loadDocxReader(url: string, signal: AbortSignal): Promise<string> {
  const data = await readDocx(url, signal);
  if (signal.aborted) throw new DOMException('Чтение отменено', 'AbortError');

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./docxReader.worker.ts', import.meta.url));
    const fail = () => {
      finish();
      reject(new Error('Не удалось подготовить документ для чтения'));
    };
    const finish = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', fail);
      worker.terminate();
    };
    const timeout = window.setTimeout(fail, 15000);
    signal.addEventListener('abort', fail, { once: true });
    worker.onerror = fail;
    worker.onmessage = (event: MessageEvent<{ html?: string }>) => {
      if (!event.data.html) {
        fail();
        return;
      }
      finish();
      resolve(event.data.html);
    };
    worker.postMessage(data, [data]);
  });
}
