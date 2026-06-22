const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080/api/v1';

const ERROR_TRANSLATIONS: Record<string, string> = {
  'email is already in use': 'Этот email уже занят',
  'username is already in use': 'Это имя пользователя уже занято',
  'invalid credentials': 'Неверный email или пароль',
  'email/username/password is required': 'Заполните все обязательные поля',
  'password must be at least 8 characters long': 'Пароль должен быть не короче 8 символов',
  'password must contain uppercase, lowercase and special characters':
    'Пароль должен содержать заглавные, строчные буквы и хотя бы один спецсимвол',
};

function translateError(message: string): string {
  return ERROR_TRANSLATIONS[message.toLowerCase()] || message;
}

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

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
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
    return undefined as T;
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = translateError(data?.error || 'Произошла ошибка. Попробуйте ещё раз.');
    throw new ApiError(message, response.status, data?.code);
  }

  return data as T;
}
