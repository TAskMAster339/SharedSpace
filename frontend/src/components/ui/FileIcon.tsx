// src/components/ui/FileIcon.tsx
import React from 'react';
import {
  Image,
  Video,
  Music,
  Table,
  Archive,
  Code,
  Type,
  FileText,
  File,
  Presentation,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { FileIconType } from '../../utils/fileType';

interface FileIconProps {
  type: FileIconType | string;
  className?: string;
  size?: number;
}

const iconMap: Record<FileIconType, React.ElementType> = {
  img: Image,
  pdf: FileText,
  video: Video,
  text: FileText,
  audio: Music,
  xlsx: Table,
  presentation: Presentation,
  archive: Archive,
  code: Code,
  font: Type,
  file: File,
};

export const FileIcon: React.FC<FileIconProps> = ({ type, className, size = 20 }) => {
  const Icon = iconMap[type as FileIconType] || File;
  return <Icon size={size} className={cn('text-theme-muted', className)} />;
};
