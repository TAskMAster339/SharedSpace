import React from 'react';
import { Folder, Star } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { FileItem } from '../components/ui/FileItem';
import { DirectoryItem } from '../components/ui/DirectoryItem';
import { EmptyState } from '../components/ui/EmptyState';
import { Link as UILink } from '../components/ui/Link';

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

export const DashboardPage: React.FC = () => {
  const { firstName } = useAuth();

  return (
    <div className="space-y-8 pb-10">
      {/* Приветствие */}
      <div>
        <h1 className="text-2xl font-semibold text-theme-primary mb-1">
          С возвращением, {firstName} ✦
        </h1>
        <p className="text-sm text-theme-muted">SharedSpace — просторный как космос</p>
      </div>

      {/* Недавние файлы */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {recentFiles.length === 0 ? (
          <div className="lg:col-span-2">
            <EmptyState
              icon={<Folder />}
              description="Нет загруженных файлов."
              action={{
                label: 'Загрузи первый файл',
                onClick: () => console.log('Upload file'),
              }}
            />
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Недавние файлы</CardTitle>
              <UILink to={`/directories/${personalStorageId}`}>Смотреть все</UILink>
            </CardHeader>
            <div className="space-y-4">
              {recentFiles.slice(0, 5).map((file) => (
                <FileItem
                  key={file.id}
                  id={file.id}
                  name={file.name}
                  date={file.date}
                  size={file.size}
                  type={file.type}
                  to={`/files/${file.id}`}
                />
              ))}
            </div>
          </Card>
        )}

        {/* Правая колонка: Общие директории (ограничение 5) */}
        <Card>
          <CardHeader>
            <CardTitle>Общие директории</CardTitle>
            <UILink to="/directories">Смотреть все</UILink>
          </CardHeader>
          {sharedDirectories.length === 0 ? (
            <EmptyState
              icon={<Folder size={24} />}
              description="Нет общих директорий."
              action={{
                label: 'Создай первую',
                onClick: () => console.log('Create directory'),
              }}
              size="sm"
            />
          ) : (
            <div className="space-y-4">
              {sharedDirectories.slice(0, 5).map((dir) => (
                <DirectoryItem
                  key={dir.id}
                  id={dir.id}
                  name={dir.name}
                  members={dir.members}
                  to={`/directories/${dir.id}`}
                />
              ))}
            </div>
          )}
        </Card>

        {/* Блок Избранного (ограничение 3) */}
        {recentFiles.length > 0 && (
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Избранное</CardTitle>
                <UILink to="/favorites">Смотреть все</UILink>
              </CardHeader>
              {favorites.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {favorites.slice(0, 3).map((fav) => (
                    <FileItem
                      key={fav.id}
                      id={fav.id}
                      name={fav.name}
                      date={fav.date}
                      size={fav.size}
                      type={fav.type}
                      to={`/files/${fav.id}`}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<Star size={24} />}
                  description="Избранных нет."
                  action={{
                    label: 'Отметь файл',
                    onClick: () => console.log('Go to favorites'),
                  }}
                  size="sm"
                />
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};