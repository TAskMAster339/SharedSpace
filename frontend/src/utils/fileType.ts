export type FileIconType =
  | 'img'
  | 'pdf'
  | 'video'
  | 'text'
  | 'audio'
  | 'xlsx'
  | 'presentation'
  | 'archive'
  | 'code'
  | 'font'
  | 'file';

// Человекочитаемые названия для типов файлов
export const FILE_TYPE_LABELS: Record<FileIconType, string> = {
  img: 'Изображение',
  pdf: 'PDF документ',
  video: 'Видео',
  text: 'Текстовый документ',
  audio: 'Аудио',
  xlsx: 'Таблица',
  presentation: 'Презентация',
  archive: 'Архив',
  code: 'Код',
  font: 'Шрифт',
  file: 'Файл',
};

// Маппинг расширений на типы иконок
const EXTENSION_TO_ICON: Record<string, FileIconType> = {
  // Изображения
  jpg: 'img',
  jpeg: 'img',
  png: 'img',
  gif: 'img',
  svg: 'img',
  webp: 'img',
  bmp: 'img',
  ico: 'img',
  tiff: 'img',
  tif: 'img',

  // Документы
  pdf: 'pdf',
  doc: 'text',
  docx: 'text',
  txt: 'text',
  rtf: 'text',
  odt: 'text',

  // Таблицы
  xls: 'xlsx',
  xlsx: 'xlsx',
  csv: 'xlsx',
  ods: 'xlsx',

  // Презентации
  ppt: 'presentation',
  pptx: 'presentation',
  odp: 'presentation',

  // Видео
  mp4: 'video',
  avi: 'video',
  mov: 'video',
  wmv: 'video',
  flv: 'video',
  mkv: 'video',
  webm: 'video',
  m4v: 'video',
  mpg: 'video',
  mpeg: 'video',

  // Аудио
  mp3: 'audio',
  wav: 'audio',
  flac: 'audio',
  aac: 'audio',
  ogg: 'audio',
  wma: 'audio',
  m4a: 'audio',

  // Архивы
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  tar: 'archive',
  gz: 'archive',
  bz2: 'archive',
  xz: 'archive',

  // Код
  js: 'code',
  ts: 'code',
  jsx: 'code',
  tsx: 'code',
  html: 'code',
  css: 'code',
  scss: 'code',
  json: 'code',
  xml: 'code',
  yaml: 'code',
  yml: 'code',
  py: 'code',
  java: 'code',
  cpp: 'code',
  c: 'code',
  go: 'code',
  rs: 'code',
  rb: 'code',
  php: 'code',
  sh: 'code',
  bash: 'code',
  sql: 'code',

  // Шрифты
  ttf: 'font',
  otf: 'font',
  woff: 'font',
  woff2: 'font',
  eot: 'font',
};

// Определение типа иконки по MIME-типу или расширению
export function resolveFileIconType(mimeType: string, extension: string): FileIconType {
  // Сначала пробуем по MIME-типу
  if (mimeType) {
    if (mimeType.startsWith('image/')) return 'img';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.startsWith('text/')) return 'text';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'xlsx';
    if (mimeType.includes('zip') || mimeType.includes('compressed')) return 'archive';
    if (mimeType.includes('python')) return 'code';
    if (mimeType.includes('javascript')) return 'code';
    if (mimeType.includes('typescript')) return 'code';
    if (mimeType.includes('java')) return 'code';
    if (mimeType.includes('c++')) return 'code';
  }

  // Потом по расширению
  const normalizedExt = extension.replace(/^\./, '').toLowerCase();
  return EXTENSION_TO_ICON[normalizedExt] || 'file';
}

// Получение человекочитаемого названия типа файла
export function getFileTypeLabel(mimeType: string, extension: string): string {
  const iconType = resolveFileIconType(mimeType, extension);
  return FILE_TYPE_LABELS[iconType] || 'Файл';
}

// Форматирование для отображения: "Тип (расширение)"
export function getFileTypeDisplay(mimeType: string, extension: string): string {
  const label = getFileTypeLabel(mimeType, extension);
  const ext = extension.replace(/^\./, '').toLowerCase();
  return `${label} (${ext})`;
}
