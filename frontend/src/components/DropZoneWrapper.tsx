import React from 'react';
import { GlobalDropZone } from './GlobalDropZone';

interface DropZoneWrapperProps {
  children: React.ReactNode;
}

export const DropZoneWrapper: React.FC<DropZoneWrapperProps> = ({ children }) => {
  return <GlobalDropZone>{children}</GlobalDropZone>;
};
