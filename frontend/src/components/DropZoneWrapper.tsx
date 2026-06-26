import React from 'react';
import { GlobalDropZone } from './GlobalDropZone';
import { useToastStore } from '../hooks/useToast';
import { buildUploadErrorMessage } from '../utils/uploadMessage';

interface DropZoneWrapperProps {
  children: React.ReactNode;
}

export const DropZoneWrapper: React.FC<DropZoneWrapperProps> = ({ children }) => {
  const { showToast } = useToastStore();

  const handleFileUploaded = (file: File, success: boolean, message?: string) => {
    if (success && message) {
      showToast(message, 'success');
    } else if (!success && message) {
      showToast(message, 'error');
    } else if (!success) {
      showToast(buildUploadErrorMessage([file]), 'error');
    }
  };

  return <GlobalDropZone onFileUploaded={handleFileUploaded}>{children}</GlobalDropZone>;
};
