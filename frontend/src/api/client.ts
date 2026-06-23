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
let refreshPromise: Promise<string> | null = null;

export function setAuthHandlers(handlers: {
  refresh: RefreshHandler;
  onAuthFailure: AuthFailureHandler;
}): void {
  refreshHandler = handlers.refresh;
  onAuthFailure = handlers.onAuthFailure;
}

// Эндпоинты самой авторизации не должны провоцировать повторный refresh.
const NO_RETRY_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

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
  return new ApiError(capitalize(message), response.status, (data as { code?: string } | null)?.code);
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token } = options;
  const { response, data } = await rawRequest<T>(path, options);

  if (response.status === 401 && token && refreshHandler && !NO_RETRY_PATHS.includes(path)) {
    try {
      if (!refreshPromise) {
        refreshPromise = refreshHandler().finally(() => {
          refreshPromise = null;
        });
      }
      const newToken = await refreshPromise;
      const retried = await rawRequest<T>(path, { ...options, token: newToken });
      if (!retried.response.ok) {
        throw toApiError(retried.response, retried.data);
      }
      return retried.data as T;
    } catch (err) {
      onAuthFailure?.();
      throw err;
    }
  }

  if (!response.ok) {
    throw toApiError(response, data);
  }

  return data as T;
}
