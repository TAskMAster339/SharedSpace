/// <reference types="jest" />
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getFilePreviewUrl } from '../../api/files';
import { FilePreview } from './FilePreview';

jest.mock('../../api/files', () => ({ getFilePreviewUrl: jest.fn() }));
jest.mock('../../store/authStore', () => ({ useAuthStore: () => 'access-token' }));

const getPreview = getFilePreviewUrl as jest.MockedFunction<typeof getFilePreviewUrl>;
beforeEach(() => getPreview.mockReset());

test('loads a media preview and falls back to the icon if the image fails', async () => {
  getPreview.mockResolvedValue({ url: 'https://storage.example/preview.jpg' });
  render(<FilePreview fileId="photo" type="img" />);
  const preview = await screen.findByAltText('');
  expect(getPreview).toHaveBeenCalledWith('access-token', 'photo');
  fireEvent.error(preview);
  expect(screen.queryByAltText('')).toBeNull();
});

test('keeps the icon when preview access is denied', async () => {
  getPreview.mockRejectedValue(new Error('forbidden'));
  render(<FilePreview fileId="video" type="video" />);
  await waitFor(() => expect(getPreview).toHaveBeenCalledTimes(1));
  expect(screen.queryByAltText('')).toBeNull();
});

test('does not request previews for documents', () => {
  render(<FilePreview fileId="document" type="pdf" />);
  expect(getPreview).not.toHaveBeenCalled();
});
