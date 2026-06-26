// constants/convertFormats.ts

// Константа с поддерживаемыми форматами конвертации по MIME-типу
export const ALLOWED_CONVERT_FORMATS: Record<string, string[]> = {
  'image/png': ['jpg', 'jpeg', 'webp'],
  'image/jpeg': ['png', 'webp'],
  'image/jpg': ['png', 'webp'],
  'image/webp': ['png', 'jpg', 'jpeg'],
  'image/gif': ['png', 'webp'],
  'image/svg+xml': ['png', 'jpg'],
  'image/bmp': ['png', 'jpg', 'webp'],
  'image/tiff': ['png', 'jpg'],
  'image/tif': ['png', 'jpg'],
};

// Поддерживаемые форматы по расширению
export const ALLOWED_CONVERT_BY_EXTENSION: Record<string, string[]> = {
  png: ['jpg', 'jpeg', 'webp'],
  jpg: ['png', 'webp'],
  jpeg: ['png', 'webp'],
  webp: ['png', 'jpg', 'jpeg'],
  gif: ['png', 'webp'],
  svg: ['png', 'jpg'],
  bmp: ['png', 'jpg', 'webp'],
  tiff: ['png', 'jpg'],
  tif: ['png', 'jpg'],
};

// Функция для проверки, поддерживается ли конвертация для файла
export function isConvertSupported(mimeType: string, extension: string): boolean {
  if (ALLOWED_CONVERT_FORMATS[mimeType]) {
    return ALLOWED_CONVERT_FORMATS[mimeType].length > 0;
  }
  const ext = extension.replace(/^\./, '').toLowerCase();
  if (ALLOWED_CONVERT_BY_EXTENSION[ext]) {
    return ALLOWED_CONVERT_BY_EXTENSION[ext].length > 0;
  }
  return false;
}

// Функция для получения доступных форматов конвертации
export function getAvailableConvertFormats(mimeType: string, extension: string): string[] {
  const formats = ALLOWED_CONVERT_FORMATS[mimeType] || [];
  if (formats.length > 0) return formats;
  const ext = extension.replace(/^\./, '').toLowerCase();
  return ALLOWED_CONVERT_BY_EXTENSION[ext] || [];
}
