import { convertToHtml, transforms } from 'mammoth';
import { unzipSync, zipSync } from 'fflate';

const maxExpandedBytes = 32 * 1024 * 1024;
const maxEntries = 512;
const maxRenderedChars = 16 * 1024 * 1024;

globalThis.addEventListener('message', async (event: MessageEvent<ArrayBuffer>) => {
  try {
    let entries = 0;
    let expandedBytes = 0;
    const files = unzipSync(new Uint8Array(event.data), {
      filter: ({ name, originalSize, size }) => {
        entries++;
        expandedBytes += Math.max(originalSize, size);
        if (
          name.startsWith('/') ||
          name.includes('\\') ||
          name
            .split('/')
            .some((segment) => ['..', '__proto__', 'constructor', 'prototype'].includes(segment)) ||
          entries > maxEntries ||
          expandedBytes > maxExpandedBytes
        ) {
          throw new Error('Документ слишком большой для мобильного чтения');
        }
        return true;
      },
    });
    const docx = zipSync(files, { level: 0 });
    const { value } = await convertToHtml(
      { arrayBuffer: docx.buffer as ArrayBuffer },
      {
        externalFileAccess: false,
        includeEmbeddedStyleMap: false,
        styleMap: ["p[style-name='SharedSpace Centered'] => p.reader-centered:fresh"],
        transformDocument: transforms.paragraph((paragraph) =>
          paragraph.alignment === 'center' && !/^(heading|title)/i.test(paragraph.styleId ?? '')
            ? { ...paragraph, styleName: 'SharedSpace Centered' }
            : paragraph,
        ),
      },
    );
    if (value.length > maxRenderedChars) {
      throw new Error('Документ слишком большой для мобильного чтения');
    }
    globalThis.postMessage({ html: value });
  } catch {
    globalThis.postMessage({ error: true });
  }
});
