import { ApiError, apiRequest } from './client';
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080/api/v1';

export interface FileUploadResponse {
  id: string;
  filename: string;
  extension: string;
  mime_type: string;
  size: number;
  directory_id: string;
  owner_id: string;
  object_key: string;
  created_at: string;
  updated_at: string;
}

export interface UploadFilesResponse {
  files: FileUploadResponse[];
}

export interface FileMetadata {
  id: string;
  filename: string;
  extension: string;
  mime_type: string;
  size: number;
  directory_id: string;
  owner_id: string;
  owner_username?: string;
  created_at: string;
  updated_at: string;
  has_share_links?: boolean;
}

interface RecentFilesResponse {
  files: FileMetadata[];
}

export function getRecentFiles(accessToken: string, limit?: number): Promise<RecentFilesResponse> {
  const query = limit ? `?limit=${limit}` : '';
  return apiRequest<RecentFilesResponse>(`/files/recent${query}`, {
    method: 'GET',
    token: accessToken,
  });
}

const maxUploadBytes = 512 * 1024 * 1024;
const uploadLimitMessage = 'Общий размер файлов в одной загрузке не должен превышать 512 МиБ';
export const MAX_UPLOAD_BYTES = maxUploadBytes;
export const UPLOAD_LIMIT_MESSAGE = uploadLimitMessage;

// Функция загрузки с прогрессом через XHR
export function uploadFilesWithProgress(
  token: string,
  directoryId: string,
  files: FileList,
  onProgress: (progress: number) => void,
): Promise<UploadFilesResponse> {
  if (Array.from(files).reduce((total, file) => total + file.size, 0) > maxUploadBytes) {
    return Promise.reject(new Error(uploadLimitMessage));
  }
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('directory_id', directoryId);

    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100);
        onProgress(progress);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch (e) {
          reject(new Error('Invalid response format'));
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.error || 'Upload failed'));
        } catch (e) {
          reject(
            new Error(
              xhr.status === 413 ? uploadLimitMessage : `Upload failed with status ${xhr.status}`,
            ),
          );
        }
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted'));
    });

    const url = `${process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080/api/v1'}/files`;
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    // Не устанавливаем Content-Type - браузер сам добавит с boundary
    xhr.send(formData);
  });
}

/**
 * Загрузка одного файла с прогрессом.
 * Используется фоновым менеджером загрузок — по одному файлу за запрос,
 * чтобы можно было отслеживать прогресс, ретраить и показывать статус per-file.
 */
export function uploadSingleFile(
  token: string,
  directoryId: string,
  file: File,
  onProgress: (progress: number) => void,
  signal?: AbortSignal,
): Promise<FileUploadResponse> {
  if (file.size > maxUploadBytes) {
    return Promise.reject(new Error(uploadLimitMessage));
  }
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Загрузка отменена', 'AbortError'));
  }
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('directory_id', directoryId);
    formData.append('files', file);

    const xhr = new XMLHttpRequest();
    let settled = false;

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };
    const ok = (data: FileUploadResponse) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(data);
    };

    function onAbort() {
      try {
        xhr.abort();
      } catch {
        /* noop */
      }
      fail(new DOMException('Загрузка отменена', 'AbortError'));
    }

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText) as UploadFilesResponse;
          const uploaded = response.files?.[0];
          if (!uploaded) {
            fail(new Error('Сервер не вернул данные о загруженном файле'));
            return;
          }
          ok(uploaded);
        } catch {
          fail(new Error('Некорректный ответ сервера'));
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          fail(new Error(error.error || 'Не удалось загрузить файл'));
        } catch {
          fail(
            new Error(xhr.status === 413 ? uploadLimitMessage : `Ошибка загрузки (${xhr.status})`),
          );
        }
      }
    });

    xhr.addEventListener('error', () => fail(new Error('Сетевая ошибка при загрузке')));
    xhr.addEventListener('abort', () => fail(new DOMException('Загрузка отменена', 'AbortError')));

    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    const url = `${API_BASE_URL}/files`;
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
  });
}

export function getFileMetadata(
  accessToken: string,
  fileId: string,
  signal?: AbortSignal,
): Promise<FileMetadata> {
  return apiRequest<FileMetadata>(`/files/${fileId}`, {
    method: 'GET',
    signal,
    token: accessToken,
  });
}

type MediaJob = {
  job_id: string;
  state: 'queued' | 'running' | 'succeeded' | 'failed';
  retry_after?: number;
  preview?: { url: string };
  conversion?: ConversionResponse;
  download?: ConversionDownloadResponse;
  failure?: { message: string; code: string; status: number };
};

function waitForMediaPoll(delay: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) throw new DOMException('Запрос отменён', 'AbortError');
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, delay);
    function abort() {
      window.clearTimeout(timer);
      reject(new DOMException('Запрос отменён', 'AbortError'));
    }
    signal?.addEventListener('abort', abort, { once: true });
  });
}

async function pollMediaJob(
  token: string,
  accepted: MediaJob,
  timeout: number | undefined,
  signal?: AbortSignal,
): Promise<MediaJob> {
  const deadline = timeout === undefined ? Infinity : Date.now() + timeout;
  let delay = (accepted.retry_after ?? 2) * 1000;
  while (Date.now() < deadline) {
    await waitForMediaPoll(delay + Math.random() * 350, signal);
    try {
      const job = await apiRequest<MediaJob>(`/files/jobs/${accepted.job_id}`, {
        token,
        cache: 'no-store',
        signal,
      });
      if (job.state === 'succeeded') return job;
      if (job.state === 'failed') {
        const failure = job.failure;
        throw new ApiError(
          failure?.message ?? 'Ошибка обработки файла',
          failure?.status ?? 503,
          failure?.code ?? 'media_failed',
        );
      }
      delay = Math.min(10_000, Math.max((job.retry_after ?? 2) * 1000, delay * 1.5));
    } catch (error) {
      const gatewayError =
        error instanceof ApiError && !error.code && [502, 503, 504].includes(error.status);
      if (!(error instanceof TypeError) && !gatewayError) throw error;
      delay = Math.min(10_000, delay * 2);
    }
  }
  throw new ApiError('Обработка продолжается в очереди', 504, 'media_pending');
}

export async function getFilePreviewUrl(
  accessToken: string,
  fileId: string,
  signal?: AbortSignal,
): Promise<{ url: string }> {
  const response = await apiRequest<{ url: string } | MediaJob>(
    `/files/${fileId}/preview?async=true`,
    { token: accessToken, signal },
  );
  if ('url' in response) return response;
  const job = await pollMediaJob(accessToken, response, 60_000, signal);
  if (!job.preview) throw new ApiError('Превью недоступно', 404);
  return job.preview;
}

export function getFileContentUrl(
  accessToken: string,
  fileId: string,
  signal?: AbortSignal,
): Promise<{ url: string }> {
  return apiRequest<{ url: string }>(`/files/${fileId}/content`, {
    method: 'GET',
    token: accessToken,
    signal,
  });
}

export function softDeleteFile(accessToken: string, fileId: string): Promise<void> {
  return apiRequest<void>(`/files/${fileId}`, {
    method: 'DELETE',
    token: accessToken,
  });
}

export function restoreFile(accessToken: string, fileId: string): Promise<void> {
  return apiRequest<void>(`/files/${fileId}/restore`, {
    method: 'POST',
    token: accessToken,
  });
}

export function permanentDeleteFile(accessToken: string, fileId: string): Promise<void> {
  return apiRequest<void>(`/files/${fileId}/permanent`, {
    method: 'DELETE',
    token: accessToken,
  });
}

export function renameFile(
  accessToken: string,
  fileId: string,
  filename: string,
): Promise<FileMetadata> {
  return apiRequest<FileMetadata>(`/files/${fileId}/rename`, {
    method: 'POST',
    token: accessToken,
    body: JSON.stringify({ filename }),
  });
}

export const moveFile = async (
  accessToken: string,
  fileId: string,
  parentId: string,
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/files/${fileId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ parent_id: parentId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Не удалось переместить файл');
  }
};

export interface ConvertRequest {
  target_format: string;
  save: boolean;
  directory_id?: string;
}

export interface ConversionResponse {
  id: string;
  source_file_id: string;
  result_file_id: string;
  source_format: string;
  target_format: string;
  created_by: string;
  created_at: string;
}

export interface ConversionDownloadResponse {
  download_url: string;
  filename: string;
}

interface ConversionOptions {
  onAccepted?: () => void;
  signal?: AbortSignal;
}

async function requestConversion(
  token: string,
  fileId: string,
  body: ConvertRequest,
  { onAccepted, signal }: ConversionOptions,
): Promise<MediaJob | ConversionResponse | ConversionDownloadResponse> {
  const path = `/files/${fileId}/convert?async=true`;
  const options = {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    signal,
    body: JSON.stringify(body),
  };
  let response: MediaJob | ConversionResponse | ConversionDownloadResponse;
  try {
    response = await apiRequest(path, options);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    response = await apiRequest(path, options);
  }
  if (!('job_id' in response)) return response;
  if (response.state === 'queued' || response.state === 'running') onAccepted?.();
  return pollMediaJob(token, response, undefined, signal);
}

export async function convertAndSave(
  accessToken: string,
  fileId: string,
  targetFormat: string,
  options: ConversionOptions = {},
): Promise<ConversionResponse> {
  const response = await requestConversion(
    accessToken,
    fileId,
    {
      target_format: targetFormat,
      save: true,
    },
    options,
  );
  if ('result_file_id' in response) return response;
  if ('conversion' in response && response.conversion) return response.conversion;
  throw new ApiError('Результат конвертации недоступен', 503);
}

export async function convertAndDownload(
  accessToken: string,
  fileId: string,
  targetFormat: string,
  options: ConversionOptions = {},
): Promise<ConversionDownloadResponse> {
  const response = await requestConversion(
    accessToken,
    fileId,
    {
      target_format: targetFormat,
      save: false,
    },
    options,
  );
  if ('download_url' in response) return response;
  if ('download' in response && response.download) return response.download;
  throw new ApiError('Результат конвертации недоступен', 503);
}
