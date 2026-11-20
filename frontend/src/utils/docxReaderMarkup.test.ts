/// <reference types="jest" />
import { sanitizeDocxMarkup } from './docxReaderMarkup';

test('keeps document structure and embedded raster images without active content', async () => {
  const content = await sanitizeDocxMarkup(
    '<p class="reader-centered" style="color: red"><strong>Заголовок</strong></p>' +
      '<p class="hidden"><a href="https://example.test/external">Ссылка</a></p>' +
      '<img src="https://example.test/remote.png">' +
      '<img src="data:image/svg+xml;base64,AAAA">' +
      '<img src="data:image/png;base64,AAAA" alt="График" onerror="alert(1)">' +
      '<iframe src="https://example.test/"></iframe><script>outside()</script>',
  );

  expect(content.querySelector('p.reader-centered strong')?.textContent).toBe('Заголовок');
  expect(content.querySelector('[style], [onerror], [href], .hidden, script, iframe')).toBeNull();
  expect(content.querySelector('a')?.textContent).toBe('Ссылка');
  expect(content.querySelectorAll('img')).toHaveLength(1);
  expect(content.querySelector('img')?.getAttribute('alt')).toBe('График');
});
