// Поддерживаемые конвертации по MIME-типам
export const ALLOWED_CONVERT_FORMATS: Record<string, string[]> = {
  // изображения
  'image/png': ['jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff'],
  'image/jpeg': ['png', 'webp', 'gif', 'bmp', 'tiff'],
  'image/jpg': ['png', 'webp', 'gif', 'bmp', 'tiff'],
  'image/webp': ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff'],
  'image/gif': ['mp4', 'webm', 'avi', 'mov', 'mkv'],
  'image/bmp': ['png', 'jpg', 'jpeg', 'webp', 'gif', 'tiff'],
  'image/tiff': ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'],
  // видео
  'video/mp4': ['webm', 'avi', 'mov', 'mkv', 'gif'],
  'video/webm': ['mp4', 'avi', 'mov', 'mkv', 'gif'],
  'video/x-msvideo': ['mp4', 'webm', 'mov', 'mkv', 'gif'],
  'video/quicktime': ['mp4', 'webm', 'avi', 'mkv', 'gif'],
  'video/x-matroska': ['mp4', 'webm', 'avi', 'mov', 'mkv', 'gif'],
  'video/avi': ['mp4', 'webm', 'mov', 'mkv', 'gif'],
  // аудио
  'audio/mpeg': ['wav', 'flac', 'ogg', 'aac'],
  'audio/wav': ['mp3', 'flac', 'ogg', 'aac'],
  'audio/flac': ['mp3', 'wav', 'ogg', 'aac'],
  'audio/ogg': ['mp3', 'wav', 'flac', 'aac'],
  'audio/aac': ['mp3', 'wav', 'flac', 'ogg'],
  'audio/mp4': ['mp3', 'wav', 'flac', 'ogg', 'aac'],
};

// Поддерживаемые форматы по расширению
export const ALLOWED_CONVERT_BY_EXTENSION: Record<string, string[]> = {
  png: ['jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff'],
  jpg: ['png', 'webp', 'gif', 'bmp', 'tiff'],
  jpeg: ['png', 'webp', 'gif', 'bmp', 'tiff'],
  webp: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff'],
  gif: ['mp4', 'webm', 'avi', 'mov', 'mkv'],
  bmp: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'tiff'],
  tiff: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'],
  mp4: ['webm', 'avi', 'mov', 'mkv', 'gif'],
  webm: ['mp4', 'avi', 'mov', 'mkv', 'gif'],
  avi: ['mp4', 'webm', 'mov', 'mkv', 'gif'],
  mov: ['mp4', 'webm', 'avi', 'mkv', 'gif'],
  mkv: ['mp4', 'webm', 'avi', 'mov', 'gif'],
  mp3: ['wav', 'flac', 'ogg', 'aac'],
  wav: ['mp3', 'flac', 'ogg', 'aac'],
  flac: ['mp3', 'wav', 'ogg', 'aac'],
  ogg: ['mp3', 'wav', 'flac', 'aac'],
  aac: ['mp3', 'wav', 'flac', 'ogg'],
  m4a: ['mp3', 'wav', 'flac', 'ogg', 'aac'],
};

export function isConvertSupported(mimeType: string, extension: string): boolean {
  const formats = ALLOWED_CONVERT_FORMATS[mimeType];
  if (formats) return formats.length > 0;
  const ext = extension.replace(/^\./, '').toLowerCase();
  return !!ALLOWED_CONVERT_BY_EXTENSION[ext]?.length;
}

export function getAvailableConvertFormats(mimeType: string, extension: string): string[] {
  const formats = ALLOWED_CONVERT_FORMATS[mimeType];
  if (formats?.length) return formats;
  const ext = extension.replace(/^\./, '').toLowerCase();
  return ALLOWED_CONVERT_BY_EXTENSION[ext] || [];
}

export function normalizeFormat(format: string): string {
  const normalized = format.toLowerCase();
  return normalized === 'jpeg' ? 'jpg' : normalized;
}
