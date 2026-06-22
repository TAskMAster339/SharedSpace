import React from 'react';
import { Link } from 'react-router-dom';
import { Image, FileText, Video, File, Music, Folder, Star, Table } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

// Мок-данные для демонстрации

type Files = {
  id: string;
  name: string;
  date: string;
  size: string;
  type: 'text' | 'pdf' | 'img' | 'audio' | 'video' | 'xlsx' ; // используем union types
};
type Dir = {
  id: string;
  name: string;
  members: number;
};

type FilesList = Files[];
type DirList = Dir[];

const recentFiles: FilesList = [
  { id: '1', name: 'Galaxy_Nebula.jpg', date: 'Окт 29, 2023', size: '2.3 MБ', type: 'img' },
  { id: '2', name: 'Project_Proposal.pdf', date: 'Март 24, 2023', size: '1.1 MБ', type: 'pdf' },
  { id: '3', name: 'Presentation.mp4', date: 'Февр 22, 2023', size: '42.9 MБ', type: 'video' },
  { id: '4', name: 'Meeting_Notes.txt', date: 'Янв 20, 2023', size: '11.7 KБ', type: 'text' },
  { id: '5', name: 'Background_Audio.mp3', date: 'Сент 18, 2023', size: '7.6 MБ', type: 'audio' },
  { id: '6', name: 'Galaxy_Nebula.jpg', date: 'Авг 29, 2023', size: '3.1 MБ', type: 'img' },
  { id: '7', name: 'Budget_2024.xlsx', date: 'Дек 15, 2023', size: '2.0 MБ', type: 'xlsx' },
  { id: '8', name: 'Song.mp3', date: 'Нояб 15, 2023', size: '8.2 MБ', type: 'audio' },
];

const sharedDirectories: DirList = [
  { id: '10', name: 'Marketing Team', members: 3 },
  { id: '20', name: 'Design Assets', members: 4 },
  { id: '30', name: 'University Project', members: 2 },
  { id: '40', name: 'Finance Reports', members: 5 },
  { id: '50', name: 'Legal Docs', members: 2 },
  { id: '60', name: 'Old Projects', members: 1 },
];

const favorites: FilesList = [
  { id: '6', name: 'Galaxy_Nebula.jpg', date: 'Апр 29, 2023', size: '3.1 MБ', type: 'img' },
  { id: '7', name: 'Budget_2024.xlsx', date: 'Июнь 15, 2023', size: '2.0 MБ', type: 'xlsx' },
  { id: '8', name: 'Presentation.mp4', date: 'Май 29, 2023', size: '42.9 MБ', type: 'video' },
  { id: '9', name: 'Meeting_Notes.txt', date: 'Июль 15, 2023', size: '11.7 KБ', type: 'text' },
];

/*
const recentFiles: FilesList = []
const sharedDirectories: DirList = []
const favorites: FilesList = []
*/

const personalStorageId = 'personal';

// Конец мока

const getIcon = (type: string) => {
  switch (type) {
    case 'img':
      return <Image size={20} className="text-gray-500" />;
    case 'pdf':
      return <FileText size={20} className="text-gray-500" />;
    case 'video':
      return <Video size={20} className="text-gray-500" />;
    case 'text':
      return <File size={20} className="text-gray-500" />;
    case 'audio':
      return <Music size={20} className="text-gray-500" />;
    case 'xlsx':
      return <Table size={20} className="text-gray-500" />;
    default:
      return <File size={20} className="text-gray-500" />;
  }
};

const DashboardPage: React.FC = () => {
  const { firstName } = useAuth();

  return (
    <div className="space-y-8 pb-10">
      {/* Приветствие */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 mb-1">С возвращением, {firstName} ✦</h1>
        <p className="text-gray-500 text-sm">SharedSpace — просторный как космос</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Если файлов нет, показываем заглушку */}
        {recentFiles.length === 0 ? (
          <div className="lg:col-span-2 py-12 text-center text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-2xl bg-white">
            <Folder className="mx-auto mb-2 text-gray-300" size={32} />
            <p>
              Нет загруженных файлов.{' '}
              <span className="text-blue-500 cursor-pointer">Загрузи первый файл,</span> чтобы начать.
            </p>
          </div>
        ) : (
          // Левая колонка: Недавние файлы (ограничение 5)
          <div className="lg:col-span-1 bg-white rounded-2xl p-5 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] border border-gray-50 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-medium text-gray-700">Недавние файлы</h3>
              <Link
                to={`/directories/${personalStorageId}`}
                className="text-sm text-blue-500 hover:text-blue-600 font-medium"
              >
                Смотреть все
              </Link>
            </div>
            <div className="space-y-4">
              {recentFiles.slice(0, 5).map((file) => (
                <Link
                  key={file.id}
                  to={`/files/${file.id}`}
                  className="flex items-center justify-between bg-gray-50 p-2 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-lg shadow-sm shrink-0">{getIcon(file.type)}</div>
                    <div>
                      <p className="text-sm text-gray-700 font-medium">{file.name}</p>
                      <p className="text-xs text-gray-400">{file.date}</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">{file.size}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Правая колонка: Общие директории (ограничение 5) */}
        <div className="bg-white rounded-2xl p-5 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] border border-gray-50 h-fit flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-medium text-gray-700">Общие директории</h3>
            <Link
              to="/directories"
              className="text-sm text-blue-500 hover:text-blue-600 font-medium"
            >
              Смотреть все
            </Link>
          </div>
          {sharedDirectories.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">
              <Folder className="mx-auto mb-2 text-gray-300" size={24} />
              <p>
                Нет общих директорий.{' '}
                <span className="text-blue-500 cursor-pointer">Создай первую</span>{' '}
                чтобы делиться файлами.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sharedDirectories.slice(0, 5).map((dir) => (
                <Link
                  key={dir.id}
                  to={`/directories/${dir.id}`}
                  className="flex items-center gap-3 p-2 bg-gray-50/80 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <div className="p-2 rounded-lg bg-blue-100 flex items-center justify-center text-blue-500 shrink-0">
                    <Folder size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">{dir.name}</p>
                    <p className="text-xs text-gray-400">{dir.members} участников</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Блок Избранного (ограничение 3) */}
        {recentFiles.length > 0 && (
          <div className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] border border-gray-50">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-medium text-gray-700">Избранное</h3>
              <Link to="/favorites" className="text-sm text-blue-500 hover:text-blue-600 font-medium">
                Смотреть все
              </Link>
            </div>

            {favorites.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {favorites.slice(0, 3).map((fav) => (
                  <Link
                    to={`/files/${fav.id}`}
                    key={fav.id}
                    className="flex items-center gap-3 bg-gray-50 p-3 rounded-xl hover:bg-gray-100 transition-colors"
                  >
                    <div className="p-2 bg-white rounded-lg shadow-sm shrink-0">
                      {getIcon(fav.type)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700 truncate max-w-[120px]">
                        {fav.name}
                      </p>
                      <p className="text-xs text-gray-400">{fav.date}</p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">
                <Star className="mx-auto mb-2 text-gray-300" size={24} />
                <p>
                  Избранных нет. <span className="text-blue-500 cursor-pointer">Отметь файл</span>{' '}
                  для быстрого дступа.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
