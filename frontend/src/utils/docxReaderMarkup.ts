const elements = [
  'a',
  'blockquote',
  'br',
  'caption',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
];
const attributes = ['alt', 'class', 'colspan', 'rowspan', 'src', 'start'];

type NativeSanitizerElement = HTMLDivElement & {
  setHTML?: (
    html: string,
    options: { sanitizer: { elements: string[]; attributes: string[] } },
  ) => void;
};

export async function sanitizeDocxMarkup(html: string): Promise<DocumentFragment> {
  const holder = document.implementation
    .createHTMLDocument()
    .createElement('div') as NativeSanitizerElement;
  if (holder.setHTML) {
    holder.setHTML(html, { sanitizer: { elements, attributes } });
  } else {
    const { default: DOMPurify } = await import('dompurify');
    holder.append(
      DOMPurify.sanitize(html, {
        ALLOWED_TAGS: elements,
        ALLOWED_ATTR: attributes,
        ALLOW_ARIA_ATTR: false,
        ALLOW_DATA_ATTR: false,
        RETURN_DOM_FRAGMENT: true,
      }),
    );
  }
  holder.querySelectorAll('img').forEach((img) => {
    if (
      !/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(
        img.getAttribute('src') ?? '',
      )
    ) {
      img.remove();
    }
  });
  holder.querySelectorAll('[class]').forEach((element) => {
    if (element.getAttribute('class') !== 'reader-centered') element.removeAttribute('class');
  });
  const content = document.createDocumentFragment();
  content.append(...Array.from(holder.childNodes));
  return content;
}
