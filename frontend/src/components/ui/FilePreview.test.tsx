/// <reference types="jest" />
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { getFilePreviewUrl } from '../../api/files';
import { FilePreview } from './FilePreview';

jest.mock('../../api/files', () => ({ getFilePreviewUrl: jest.fn() }));
jest.mock('../../store/authStore', () => ({ useAuthStore: () => 'access-token' }));

const getPreview = getFilePreviewUrl as jest.MockedFunction<typeof getFilePreviewUrl>;
beforeEach(() => getPreview.mockReset());

test('loads a media preview and falls back to the icon if the image fails', async () => {
  getPreview.mockResolvedValue({ url: 'https://storage.example/preview.jpg' });
  const { container } = render(<FilePreview fileId="photo" type="img" />);
  await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
  expect(getPreview).toHaveBeenCalledWith('access-token', 'photo');
  fireEvent.error(container.querySelector('img')!);
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('svg')).not.toBeNull();
});

test('keeps the icon when preview access is denied', async () => {
  getPreview.mockRejectedValue(new Error('forbidden'));
  const { container } = render(<FilePreview fileId="video" type="video" />);
  await waitFor(() => expect(getPreview).toHaveBeenCalledTimes(1));
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('svg')).not.toBeNull();
});

test('does not request previews for documents', () => {
  render(<FilePreview fileId="document" type="pdf" />);
  expect(getPreview).not.toHaveBeenCalled();
});
