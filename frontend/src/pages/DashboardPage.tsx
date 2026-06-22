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
  type: 'text' | 'pdf' | 'img' | 'audio' | 'video' | 'xlsx';
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
    <div className="page-container">
      {/* Приветствие */}
      <div>
        <h1 className="page-heading">С возвращением, {firstName} ✦</h1>
        <p className="page-subheading">SharedSpace — просторный как космос</p>
      </div>

      <div className="grid-2">
        {/* Если файлов нет, показываем заглушку */}
        {recentFiles.length === 0 ? (
          <div className="lg:col-span-2 card-empty">
            <Folder className="empty-icon" size={32} />
            <p className="empty-text">
              Нет загруженных файлов.{' '}
              <span className="empty-action">Загрузи первый файл,</span> чтобы начать.
            </p>
          </div>
        ) : (
          // Левая колонка: Недавние файлы (ограничение 5)
          <div className="card flex flex-col">
            <div className="card-header">
              <h3 className="card-title">Недавние файлы</h3>
              <Link to={`/directories/${personalStorageId}`} className="link">
                Смотреть все
              </Link>
            </div>
            <div className="space-y-4">
              {recentFiles.slice(0, 5).map((file) => (
                <Link key={file.id} to={`/files/${file.id}`} className="item-row">
                  <div className="item-row-content">
                    <div className="item-icon-box">{getIcon(file.type)}</div>
                    <div>
                      <p className="item-name">{file.name}</p>
                      <p className="item-date">{file.date}</p>
                    </div>
                  </div>
                  <span className="item-size">{file.size}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Правая колонка: Общие директории (ограничение 5) */}
        <div className="card h-fit flex flex-col">
          <div className="card-header">
            <h3 className="card-title">Общие директории</h3>
            <Link to="/directories" className="link">
              Смотреть все
            </Link>
          </div>
          {sharedDirectories.length === 0 ? (
            <div className="card-empty-sm">
              <Folder className="empty-icon" size={24} />
              <p className="empty-text">
                Нет общих директорий.{' '}
                <span className="empty-action">Создай первую</span>{' '}
                чтобы делиться файлами.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sharedDirectories.slice(0, 5).map((dir) => (
                <Link key={dir.id} to={`/directories/${dir.id}`} className="item-card">
                  <div className="item-icon-brand">
                    <Folder size={18} />
                  </div>
                  <div>
                    <p className="item-name">{dir.name}</p>
                    <p className="item-date">{dir.members} участников</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Блок Избранного (ограничение 3) */}
        {recentFiles.length > 0 && (
          <div className="lg:col-span-2 card">
            <div className="card-header">
              <h3 className="card-title">Избранное</h3>
              <Link to="/favorites" className="link">
                Смотреть все
              </Link>
            </div>

            {favorites.length > 0 ? (
              <div className="grid-3">
                {favorites.slice(0, 3).map((fav) => (
                  <Link key={fav.id} to={`/files/${fav.id}`} className="item-card">
                    <div className="item-icon-box">{getIcon(fav.type)}</div>
                    <div>
                      <p className="item-name">{fav.name}</p>
                      <p className="item-date">{fav.date}</p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="card-empty-sm">
                <Star className="empty-icon" size={24} />
                <p className="empty-text">
                  Избранных нет. <span className="empty-action">Отметь файл</span>{' '}
                  для быстрого доступа.
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
