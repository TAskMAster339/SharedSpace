export const MOCK_USER = {
  firstName: 'Алиса',
  lastName: 'Павловна',
  avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',
  isAuthenticated: true, // Меняйте на false, чтобы проверить неавторизованный вид
};

export const useAuth = () => {
  // Здесь будет реальная проверка токена (localStorage, Redux, Context)
  // Пока возвращаем заглушку
  return MOCK_USER;
};
