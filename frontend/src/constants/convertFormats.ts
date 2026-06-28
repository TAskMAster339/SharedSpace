// Поддерживаемые конвертации
export const ALLOWED_CONVERT_FORMATS: Record<string, string[]> = {
  'image/png': ['jpg', 'jpeg', 'webp'],
  'image/jpeg': ['webp'],
  'image/jpg': ['webp'],
};

// Поддерживаемые форматы по расширению
export const ALLOWED_CONVERT_BY_EXTENSION: Record<string, string[]> = {
  png: ['jpg', 'jpeg', 'webp'],
  jpg: ['webp'],
  jpeg: ['webp'],
};

// Функция для проверки, поддерживается ли конвертация для файла
export function isConvertSupported(mimeType: string, extension: string): boolean {
  if (ALLOWED_CONVERT_FORMATS[mimeType]) {
    return ALLOWED_CONVERT_FORMATS[mimeType].length > 0;
  }
  const ext = extension.replace(/^\./, '').toLowerCase();
  return !!ALLOWED_CONVERT_BY_EXTENSION[ext]?.length;
}

// Функция для получения доступных форматов конвертации
export function getAvailableConvertFormats(mimeType: string, extension: string): string[] {
  const formats = ALLOWED_CONVERT_FORMATS[mimeType] || [];
  if (formats.length > 0) return formats;
  const ext = extension.replace(/^\./, '').toLowerCase();
  return ALLOWED_CONVERT_BY_EXTENSION[ext] || [];
}

// Нормализация формата (jpeg → jpg для соответствия бэкенду)
export function normalizeFormat(format: string): string {
  const normalized = format.toLowerCase();
  return normalized === 'jpeg' ? 'jpg' : normalized;
}
