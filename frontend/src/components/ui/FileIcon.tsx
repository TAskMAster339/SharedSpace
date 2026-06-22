import React from 'react';
import { Image, FileText, Video, File, Music, Table } from 'lucide-react';
import { cn } from '../../utils/cn';

interface FileIconProps {
  type: 'img' | 'pdf' | 'video' | 'text' | 'audio' | 'xlsx' | string;
  className?: string;
  size?: number;
}

export const FileIcon: React.FC<FileIconProps> = ({ type, className, size = 20 }) => {
  const icons = {
    img: Image,
    pdf: FileText,
    video: Video,
    text: File,
    audio: Music,
    xlsx: Table,
  };

  const Icon = icons[type as keyof typeof icons] || File;

  return <Icon size={size} className={cn('text-theme-muted', className)} />;
};