const editable = new Set(['docx', 'xlsx', 'pptx']);
const viewOnly = new Set(['doc', 'xls', 'ppt', 'odt', 'ods', 'odp']);

function extension(filename: string) {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

export function canEditOfficeFile(filename: string) {
  return editable.has(extension(filename));
}

export function canPreviewOfficeFile(filename: string) {
  return canEditOfficeFile(filename) || viewOnly.has(extension(filename));
}
