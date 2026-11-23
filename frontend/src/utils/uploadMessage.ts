export function buildSingleFileSuccessMessage(name: string, addedToFavorites = false): string {
  return addedToFavorites
    ? `«${name}» успешно загружен и добавлен в избранное`
    : `«${name}» успешно загружен`;
}

export function buildSingleFileErrorMessage(name: string, error?: string): string {
  return error ? `Не удалось загрузить «${name}»: ${error}` : `Не удалось загрузить «${name}»`;
}
