export type FileIconType = 'img' | 'pdf' | 'video' | 'text' | 'audio' | 'xlsx';

const EXTENSION_MAP: Record<string, FileIconType> = {
  xls: 'xlsx',
  xlsx: 'xlsx',
  csv: 'xlsx',
};

export function resolveFileIconType(mimeType: string, extension: string): FileIconType | string {
  if (mimeType.startsWith('image/')) return 'img';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('text/')) return 'text';

  const normalizedExt = extension.replace(/^\./, '').toLowerCase();
  // Любой другой формат (архивы, документы и т.д.) получает обычную файловую иконку —
  // FileIcon сам подставит дефолт для нераспознанного типа.
  return EXTENSION_MAP[normalizedExt] ?? 'file';
}
