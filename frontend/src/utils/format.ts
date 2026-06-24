const BYTE_UNITS = ['Б', 'KБ', 'MБ', 'ГБ', 'ТБ'];

export function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return '0 Б';
  }
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${exponent === 0 ? value : value.toFixed(1)} ${BYTE_UNITS[exponent]}`;
}

const MONTHS = [
  'Янв',
  'Февр',
  'Март',
  'Апр',
  'Май',
  'Июнь',
  'Июль',
  'Авг',
  'Сент',
  'Окт',
  'Нояб',
  'Дек',
];

export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
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
