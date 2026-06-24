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
