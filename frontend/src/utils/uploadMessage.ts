// Единый формат текста уведомлений о загрузке файлов.
// Всегда содержит имя(имена) файлов и согласуется по числу (файл/файлы).

const quoteNames = (files: FileList | File[]): { subject: string; isSingle: boolean } => {
  const names = Array.from(files).map((f) => f.name);
  const isSingle = names.length === 1;
  const subject = names.map((n) => `«${n}»`).join(', ');
  return { subject, isSingle };
};

export function buildUploadSuccessMessage(
  files: FileList | File[],
  addedToFavorites = false,
): string {
  const { subject, isSingle } = quoteNames(files);
  const verb = isSingle ? 'успешно загружен' : 'успешно загружены';
  const favPart = addedToFavorites
    ? isSingle
      ? ' и добавлен в избранное'
      : ' и добавлены в избранное'
    : '';
  return `${subject} ${verb}${favPart}`;
}

export function buildUploadErrorMessage(files: FileList | File[], error?: string): string {
  const { subject } = quoteNames(files);
  return error ? `Не удалось загрузить ${subject}: ${error}` : `Не удалось загрузить ${subject}`;
}
