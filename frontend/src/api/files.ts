import { apiRequest } from './client';

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
  created_at: string;
  updated_at: string;
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

// Функция загрузки с прогрессом через XHR
export function uploadFilesWithProgress(
  token: string,
  directoryId: string,
  files: FileList,
  onProgress: (progress: number) => void,
): Promise<UploadFilesResponse> {
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
          reject(new Error(`Upload failed with status ${xhr.status}`));
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

export function getFileMetadata(accessToken: string, fileId: string): Promise<FileMetadata> {
  return apiRequest<FileMetadata>(`/files/${fileId}`, {
    method: 'GET',
    token: accessToken,
  });
}

export function getFileContentUrl(accessToken: string, fileId: string): Promise<{ url: string }> {
  return apiRequest<{ url: string }>(`/files/${fileId}/content`, {
    method: 'GET',
    token: accessToken,
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
