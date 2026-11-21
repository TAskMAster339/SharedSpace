import { apiRequest } from './client';

export interface DocumentVersion {
  number: number;
  size: number;
  created_at: string;
  contributors: string[];
}

export interface DocumentHistory {
  can_edit: boolean;
  can_restore: boolean;
  save_pending: boolean;
  versions: DocumentVersion[];
}

export interface DocumentEditorSession {
  lease_id?: string;
  script_url: string;
  theme_bridge_url?: string;
  config: {
    document: { title: string };
    editorConfig: { customization: Record<string, unknown> };
  };
}

export function getDocumentHistory(token: string, id: string, signal?: AbortSignal) {
  return apiRequest<DocumentHistory>(`/files/${id}/versions`, { token, signal });
}

export type OfficeMode = 'edit' | 'view';
export type OfficeTheme = 'light' | 'dark';
export type OfficeLayout = 'compact' | 'reader';

export function startOfficeSession(
  token: string,
  id: string,
  mode: OfficeMode,
  theme: OfficeTheme,
  signal: AbortSignal,
  layout?: OfficeLayout,
) {
  const endpoint = mode === 'edit' ? 'editor-session' : 'preview-session';
  return apiRequest<DocumentEditorSession>(
    `/files/${id}/${endpoint}?theme=${theme}${layout ? `&layout=${layout}` : ''}`,
    {
      token,
      signal,
      method: 'POST',
    },
  );
}

export function renewOfficeLease(id: string, signal: AbortSignal) {
  return apiRequest<void>('/office/lease', {
    method: 'POST',
    headers: { Authorization: `Bearer ${id}` },
    signal,
  });
}

export function releaseOfficeLease(id: string) {
  return apiRequest<void>('/office/lease', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${id}` },
    keepalive: true,
  });
}

export function getDocumentVersionURL(token: string, id: string, number: number) {
  return apiRequest<{ url: string }>(`/files/${id}/versions/${number}/content`, { token });
}

export function restoreDocumentVersion(token: string, id: string, number: number) {
  return apiRequest<void>(`/files/${id}/versions/${number}/restore`, { token, method: 'POST' });
}
