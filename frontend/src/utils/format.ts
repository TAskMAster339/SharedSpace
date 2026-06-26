export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Б';
  const k = 1024;
  const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return 'Сегодня';
  } else if (days === 1) {
    return 'Вчера';
  } else if (days < 7) {
    return `${days} дн. назад`;
  } else {
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
}

// Абсолютная дата без относительных формулировок («12 июня 2025 г.»).
export function formatDateLong(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const compactNumberFormatter = new Intl.NumberFormat('ru', { notation: 'compact' });

export function formatCount(count: number): string {
  return compactNumberFormatter.format(count);
}

function pluralizeRu(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export function formatCountWord(count: number, one: string, few: string, many: string): string {
  return count < 1000 ? pluralizeRu(count, one, few, many) : many;
}
