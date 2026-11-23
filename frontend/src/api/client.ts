import { capitalize } from '../utils/text';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080/api/v1';

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions extends RequestInit {
  token?: string;
}

type RefreshHandler = () => Promise<string>;
type AuthFailureHandler = () => void;

// Регистрируются authStore-ом, чтобы client.ts мог молча обновлять access-токен
// при 401 без прямой зависимости от store (избегаем циклического импорта).
let refreshHandler: RefreshHandler | null = null;
let onAuthFailure: AuthFailureHandler | null = null;
let getRefreshToken: (() => string | null | undefined) | null = null;
let getSessionVersion: (() => number) | null = null;
let getAccessToken: (() => string | null) | null = null;
let pendingRefresh: { token: string; promise: Promise<string> } | null = null;

export function setAuthHandlers(handlers: {
  refresh: RefreshHandler;
  onAuthFailure: AuthFailureHandler;
  getRefreshToken: () => string | null | undefined;
  getAccessToken: () => string | null;
  getSessionVersion: () => number;
}): void {
  refreshHandler = handlers.refresh;
  onAuthFailure = handlers.onAuthFailure;
  getRefreshToken = handlers.getRefreshToken;
  getAccessToken = handlers.getAccessToken;
  getSessionVersion = handlers.getSessionVersion;
}

// Эндпоинты самой авторизации не должны провоцировать повторный refresh.
// Сюда же попадают публичные эндпоинты подтверждения почты и сброса пароля —
// у них нет access-токена, и попытка refresh-услуг ничего не даст.
const NO_RETRY_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
  '/auth/verify-email',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/resend-verification/me',
];

interface RawResult<T> {
  response: Response;
  data: T | null;
}

async function rawRequest<T>(path: string, options: RequestOptions): Promise<RawResult<T>> {
  const { token, headers, ...rest } = options;

  const requestHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (token) {
    (requestHeaders as Record<string, string>).Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: requestHeaders,
  });

  if (response.status === 204) {
    return { response, data: null };
  }

  const data = await response.json().catch(() => null);
  return { response, data };
}

function toApiError(response: Response, data: unknown): ApiError {
  const message =
    (data as { error?: string } | null)?.error || 'Произошла ошибка. Попробуйте ещё раз.';
  return new ApiError(
    capitalize(message),
    response.status,
    (data as { code?: string } | null)?.code,
  );
}

export function refreshAccessToken(rejectedToken: string): Promise<string> {
  const currentToken = getAccessToken?.();
  if (currentToken && currentToken !== rejectedToken) return Promise.resolve(currentToken);

  const refreshToken = getRefreshToken?.();
  if (!refreshHandler || !refreshToken) {
    onAuthFailure?.();
    return Promise.reject(new ApiError('Сеанс завершён', 401));
  }
  if (pendingRefresh?.token === refreshToken) return pendingRefresh.promise;

  const sessionVersion = getSessionVersion?.();
  const promise = refreshHandler()
    .catch((error) => {
      if (getSessionVersion?.() === sessionVersion && getRefreshToken?.() === refreshToken) {
        onAuthFailure?.();
      }
      throw error;
    })
    .finally(() => {
      if (pendingRefresh?.promise === promise) pendingRefresh = null;
    });
  pendingRefresh = { token: refreshToken, promise };
  return promise;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token } = options;
  const sessionVersion = getSessionVersion?.();
  const { response, data } = await rawRequest<T>(path, options);

  if (
    response.status === 401 &&
    token &&
    refreshHandler &&
    !NO_RETRY_PATHS.includes(path) &&
    getSessionVersion?.() === sessionVersion &&
    !options.signal?.aborted
  ) {
    const newToken = await refreshAccessToken(token);
    if (getSessionVersion?.() !== sessionVersion || options.signal?.aborted) {
      throw new DOMException('Запрос отменён', 'AbortError');
    }
    const retried = await rawRequest<T>(path, { ...options, token: newToken });
    if (!retried.response.ok) {
      throw toApiError(retried.response, retried.data);
    }
    return retried.data as T;
  }

  if (!response.ok) {
    throw toApiError(response, data);
  }

  return data as T;
}
