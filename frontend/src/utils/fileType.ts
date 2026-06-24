export type FileIconType = 'img' | 'pdf' | 'video' | 'text' | 'audio' | 'xlsx' | 'presentation' | 'archive' | 'code' | 'font' | 'file';

// Маппинг расширений на типы иконок
const EXTENSION_TO_ICON: Record<string, FileIconType> = {
  // Изображения
  'jpg': 'img',
  'jpeg': 'img',
  'png': 'img',
  'gif': 'img',
  'svg': 'img',
  'webp': 'img',
  'bmp': 'img',
  'ico': 'img',
  'tiff': 'img',
  'tif': 'img',
  
  // Документы
  'pdf': 'pdf',
  'doc': 'text',
  'docx': 'text',
  'txt': 'text',
  'rtf': 'text',
  'odt': 'text',
  
  // Таблицы
  'xls': 'xlsx',
  'xlsx': 'xlsx',
  'csv': 'xlsx',
  'ods': 'xlsx',
  
  // Презентации
  'ppt': 'presentation',
  'pptx': 'presentation',
  'odp': 'presentation',
  
  // Видео
  'mp4': 'video',
  'avi': 'video',
  'mov': 'video',
  'wmv': 'video',
  'flv': 'video',
  'mkv': 'video',
  'webm': 'video',
  'm4v': 'video',
  'mpg': 'video',
  'mpeg': 'video',
  
  // Аудио
  'mp3': 'audio',
  'wav': 'audio',
  'flac': 'audio',
  'aac': 'audio',
  'ogg': 'audio',
  'wma': 'audio',
  'm4a': 'audio',
  
  // Архивы
  'zip': 'archive',
  'rar': 'archive',
  '7z': 'archive',
  'tar': 'archive',
  'gz': 'archive',
  'bz2': 'archive',
  'xz': 'archive',
  
  // Код
  'js': 'code',
  'ts': 'code',
  'jsx': 'code',
  'tsx': 'code',
  'html': 'code',
  'css': 'code',
  'scss': 'code',
  'json': 'code',
  'xml': 'code',
  'yaml': 'code',
  'yml': 'code',
  'py': 'code',
  'java': 'code',
  'cpp': 'code',
  'c': 'code',
  'go': 'code',
  'rs': 'code',
  'rb': 'code',
  'php': 'code',
  'sh': 'code',
  'bash': 'code',
  'sql': 'code',
  
  // Шрифты
  'ttf': 'font',
  'otf': 'font',
  'woff': 'font',
  'woff2': 'font',
  'eot': 'font',
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
  }

  // Потом по расширению
  const normalizedExt = extension.replace(/^\./, '').toLowerCase();
  return EXTENSION_TO_ICON[normalizedExt] || 'file';
}
