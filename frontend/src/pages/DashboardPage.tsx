import React from 'react';
import { Link } from 'react-router-dom';
import { Image, FileText, Video, File, Music, Users, Folder, Star, Table } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

// Мок-данные для демонстрации
const recentFiles = [
  { id: '1', name: 'Galaxy_Nebula.jpg', date: 'Oct 29, 2023', size: '2.3 MB', type: 'img' },
  { id: '2', name: 'Project_Proposal.pdf', date: 'Oct 24, 2023', size: '1.1 MB', type: 'pdf' },
  { id: '3', name: 'Presentation.mp4', date: 'Oct 22, 2023', size: '42.9 MB', type: 'video' },
  { id: '4', name: 'Meeting_Notes.txt', date: 'Oct 20, 2023', size: '11.7 KB', type: 'text' },
  { id: '5', name: 'Background_Audio.mp3', date: 'Oct 18, 2023', size: '7.6 MB', type: 'audio' },
  { id: '6', name: 'Galaxy_Nebula.jpg', date: 'Oct 29, 2023', type: 'img' },
  { id: '7', name: 'Budget_2024.xlsx', date: 'Oct 15, 2023', size: '2.0 MB', type: 'xlsx' },
];

const sharedDirectories = [
  { id: '10', name: 'Marketing Team', members: 3 },
  { id: '20', name: 'Design Assets', members: 4 },
  { id: '30', name: 'University Project', members: 2 },
  { id: '40', name: 'Finance Reports', members: 5 },
  { id: '50', name: 'Legal Docs', members: 2 },
  { id: '60', name: 'Old Projects', members: 1 },
];

const favorites = [
  { id: '6', name: 'Galaxy_Nebula.jpg', date: 'Oct 29, 2023', type: 'img' },
  { id: '7', name: 'Budget_2024.xlsx', date: 'Oct 15, 2023', size: '2.0 MB', type: 'xlsx' },
];

const personalStorageId = 'personal';

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
  const hasAnyFiles = recentFiles.length > 0 || favorites.length > 0;

  return (
    <div className="space-y-8 pb-10">
      {/* Приветствие */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 mb-1">Welcome back, {firstName} ✦</h1>
        <p className="text-gray-500 text-sm">SharedSpace — просторный как космос</p>
      </div>

      {/* 3 карточки статистики (с динамическим подсчетом) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Items */}
        <div className="bg-white rounded-2xl p-5 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] border border-gray-50 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-blue-50 rounded-xl text-blue-500">
              <Folder size={20} />
            </div>
            <span className="text-sm text-gray-400">Personal</span>
          </div>
          <div className="text-3xl font-bold text-gray-800">{recentFiles.length}</div>
          <div className="text-sm text-gray-500 mt-1">Total Items</div>
        </div>

        {/* Shared Directories */}
        <div className="bg-white rounded-2xl p-5 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] border border-gray-50 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-indigo-50 rounded-xl text-indigo-500">
              <Users size={20} />
            </div>
            <span className="text-sm text-gray-400">Shared</span>
          </div>
          <div className="text-3xl font-bold text-gray-800">{sharedDirectories.length}</div>
          <div className="text-sm text-gray-500 mt-1">Shared Directories</div>
        </div>

        {/* Favorites */}
        <div className="bg-white rounded-2xl p-5 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] border border-gray-50 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-yellow-50 rounded-xl text-yellow-500">
              <Star size={20} />
            </div>
            <span className="text-sm text-gray-400">Favorites</span>
          </div>
          <div className="text-3xl font-bold text-gray-800">{favorites.length}</div>
          <div className="text-sm text-gray-500 mt-1">Favorite Files</div>
        </div>
      </div>

      {/* Если файлов нет, показываем заглушку вместо сетки */}
      {!hasAnyFiles ? (
        <div className="py-12 text-center text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-2xl bg-white">
          <Folder className="mx-auto mb-2 text-gray-300" size={32} />
          <p>
            No files uploaded yet.{' '}
            <span className="text-blue-500 cursor-pointer">Upload a file</span> to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Левая колонка: Недавние файлы (ограничение 5) */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] border border-gray-50">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-medium text-gray-700">Recent Files</h3>
              <Link
                to={`/directories/${personalStorageId}`}
                className="text-sm text-blue-500 hover:text-blue-600 font-medium"
              >
                View all
              </Link>
            </div>
            <div className="space-y-3">
              {recentFiles.slice(0, 5).map((file) => (
                <Link
                  key={file.id}
                  to={`/files/${file.id}`}
                  className="flex items-center justify-between py-1.5 hover:bg-gray-50 rounded-lg px-2 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-gray-100 rounded-md">{getIcon(file.type)}</div>
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

          {/* Правая колонка: Shared Directories (скролл) */}
          <div className="bg-white rounded-2xl p-5 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] border border-gray-50 h-fit">
            <h3 className="font-medium text-gray-700 mb-4">Shared Directories</h3>
            {/* max-h + overflow-y-auto создает скролл при переполнении */}
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
              {sharedDirectories.map((dir) => (
                <Link
                  key={dir.id}
                  to={`/directories/${dir.id}`}
                  className="flex items-center gap-3 p-2 bg-gray-50/80 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-500 shrink-0">
                    <Folder size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">{dir.name}</p>
                    <p className="text-xs text-gray-400">{dir.members} members</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Блок Избранного (ограничение 3) */}
      {hasAnyFiles && (
        <div className="bg-white rounded-2xl p-5 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] border border-gray-50">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-medium text-gray-700">Favorites</h3>
            <Link to="/favorites" className="text-sm text-blue-500 hover:text-blue-600 font-medium">
              View all
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
                No favorites yet. <span className="text-blue-500 cursor-pointer">Add a file</span>{' '}
                for quick access.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
