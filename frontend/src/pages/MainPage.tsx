import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Folder, Users, Link2, Eye, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { cn } from '../utils/cn';

const logo = '/logo.jpg';

const FEATURES = [
  {
    icon: Folder,
    title: 'Личное пространство',
    description: 'Папки, избранное и корзина — порядок в файлах без лишних усилий.',
  },
  {
    icon: Users,
    title: 'Совместная работа',
    description: 'Создавайте общие папки, приглашайте участников и управляйте правами доступа.',
  },
  {
    icon: Link2,
    title: 'Обмен по ссылке',
    description: 'Делитесь файлами публично или только с авторизованными пользователями.',
  },
  {
    icon: Eye,
    title: 'Просмотр без скачивания',
    description: 'Изображения, PDF, видео и аудио открываются прямо в браузере.',
  },
  {
    icon: RefreshCw,
    title: 'Конвертация форматов',
    description: 'Конвертируйте PNG, JPG и WEBP прямо в браузере — без установки программ.',
  },
];

const STEPS = [
  { title: 'Зарегистрируйтесь', description: 'Это бесплатно и займёт меньше минуты.' },
  {
    title: 'Загрузите файлы или создайте общую папку',
    description: 'Организуйте пространство так, как удобно вам.',
  },
  {
    title: 'Делитесь и работайте вместе',
    description: 'Приглашайте людей и держите всё важное в одном месте.',
  },
];

// Иконки-«спутники» на орбите вокруг лого. Позиции — 12/3/6/9 часов по краю кольца.
const ORBIT = [
  { icon: Users, position: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2' },
  { icon: Link2, position: 'top-1/2 right-0 translate-x-1/2 -translate-y-1/2' },
  { icon: Eye, position: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2' },
  { icon: RefreshCw, position: 'top-1/2 left-0 -translate-x-1/2 -translate-y-1/2' },
];

const MainPage: React.FC = () => {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      return;
    }
    const el = document.getElementById(hash.slice(1));
    if (!el) {
      return;
    }
    const timer = setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    return () => clearTimeout(timer);
  }, [hash]);

  return (
    <div>
      {/* Hero — на всю ширину экрана, заподлицо с шапкой, на полный экран */}
      <section className="relative left-1/2 right-1/2 -mx-[50vw] -mt-4 sm:-mt-6 w-screen min-h-[calc(100vh-4rem)] flex items-center overflow-hidden bg-brand-gradient">
        <div className="absolute inset-0 bg-starfield opacity-60" />
        <div className="absolute -top-10 -right-10 w-80 h-80 bg-white/10 rounded-theme-full blur-3xl" />
        <div className="absolute bottom-0 left-10 w-64 h-64 bg-white/10 rounded-theme-full blur-3xl" />

        <div className="relative w-full max-w-6xl mx-auto px-6 sm:px-10 py-12 grid sm:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <span className="inline-block text-xs font-semibold uppercase tracking-wide text-white bg-white/15 border border-white/25 px-3 py-1 rounded-theme-full">
              SharedSpace — просторный как космос
            </span>
            <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight">
              Ваши файлы. Ваше пространство. Ваши правила.
            </h1>
            <p className="text-base sm:text-lg text-white/85 leading-relaxed max-w-md">
              Храните файлы в личном облаке и работайте над общими папками с коллегами и друзьями —
              без хаоса.
            </p>
            <Link to="/register" className="inline-block">
              <Button size="lg" className="bg-white text-brand-dark hover:bg-white/90">
                Начать бесплатно
              </Button>
            </Link>
          </div>

          {/* «Планета»-лого с вращающейся орбитой возможностей */}
          <div className="relative hidden sm:flex items-center justify-center h-96">
            <div className="relative w-80 h-80">
              <div className="absolute inset-0 rounded-theme-full bg-white/15 blur-2xl" />

              {/* Вращающееся кольцо со спутниками */}
              <div className="absolute inset-0 rounded-theme-full border-2 border-dashed border-white/40 animate-orbit">
                {ORBIT.map(({ icon: Icon, position }, i) => (
                  // Внешний div отвечает за позицию (translate), внутренний — за контр-вращение,
                  // иначе анимация rotate перезаписала бы центрирующий transform.
                  <div key={i} className={cn('absolute w-14 h-14', position)}>
                    <div className="w-full h-full rounded-theme-full bg-white shadow-theme-dropdown flex items-center justify-center animate-orbit-reverse">
                      <Icon size={24} className="text-brand" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Центральное лого */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-theme-full bg-white shadow-theme-dropdown flex items-center justify-center p-6">
                <img src={logo} alt="SharedSpace" className="w-full h-full object-contain" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Возможности */}
      <section
        id="features"
        className="min-h-[calc(100vh-4rem)] flex flex-col justify-center space-y-8 py-12"
      >
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-theme-primary">Возможности</h2>
          <p className="text-theme-secondary">Всё необходимое для хранения и совместной работы</p>
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <Card
              key={title}
              className="group w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.7rem)] space-y-3 transition-all hover:-translate-y-1 hover:shadow-theme-dropdown"
            >
              <div className="w-11 h-11 flex items-center justify-center rounded-theme-md bg-brand-light transition-colors group-hover:bg-brand">
                <Icon size={22} className="text-brand transition-colors group-hover:text-white" />
              </div>
              <h3 className="font-semibold text-theme-primary">{title}</h3>
              <p className="text-sm text-theme-secondary leading-relaxed">{description}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Как это работает */}
      <section
        id="how-it-works"
        className="min-h-[calc(100vh-4rem)] flex flex-col justify-center space-y-10 py-12"
      >
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-theme-primary">Как это работает</h2>
          <p className="text-theme-secondary">Три шага, чтобы начать пользоваться SharedSpace</p>
        </div>
        <div className="relative">
          {/* Соединительная линия между шагами (только на десктопе) */}
          <div className="hidden sm:block absolute top-7 left-[16.66%] right-[16.66%] border-t-2 border-dashed border-theme" />
          <div className="grid sm:grid-cols-3 gap-8">
            {STEPS.map(({ title, description }, index) => (
              <div key={title} className="relative text-center space-y-3">
                <div className="relative z-10 mx-auto w-14 h-14 flex items-center justify-center rounded-theme-full bg-brand text-theme-on-brand text-lg font-bold shadow-theme-card">
                  {index + 1}
                </div>
                <h3 className="font-semibold text-theme-primary">{title}</h3>
                <p className="text-sm text-theme-secondary leading-relaxed max-w-xs mx-auto">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default MainPage;
