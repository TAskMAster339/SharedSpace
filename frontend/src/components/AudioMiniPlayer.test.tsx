/// <reference types="jest" />
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { DesktopAudioMiniPlayer } from './AudioMiniPlayer';
import * as playback from '../store/audioPlaybackStore';

jest.mock(
  'react-router-dom',
  () => ({
    useLocation: () => ({ pathname: '/dashboard', search: '' }),
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
  }),
  { virtual: true },
);

const initialState = playback.useAudioPlayback.getState();

afterEach(() => {
  playback.useAudioPlayback.setState(initialState);
  jest.restoreAllMocks();
});

test('keeps pause and track navigation available in the compact player', () => {
  const toggle = jest.spyOn(playback, 'toggleTrack').mockImplementation(() => undefined);
  const advance = jest.spyOn(playback, 'advanceTrack').mockResolvedValue(undefined);
  playback.useAudioPlayback.setState({
    track: { id: 'track', name: 'Трек.mp3', src: '/audio.mp3', directoryId: 'playlist' },
    playing: true,
    compact: true,
  });

  render(<DesktopAudioMiniPlayer />);

  const player = within(screen.getByRole('complementary', { name: 'Мини-плеер' }));
  fireEvent.click(player.getByRole('button', { name: 'Пауза' }));
  fireEvent.click(player.getByRole('button', { name: 'Предыдущий трек' }));
  fireEvent.click(player.getByRole('button', { name: 'Следующий трек' }));

  expect(toggle).toHaveBeenCalledTimes(1);
  expect(advance.mock.calls).toEqual([[-1], [1]]);
  expect(player.queryByRole('slider')).toBeNull();
});

test.each([
  [{ directoryId: 'playlist' }, '/files/track', '/directories/playlist'],
  [
    { favoriteCursor: 'date|track', directoryId: 'playlist' },
    '/files/track?playlist=favorites&cursor=date%7Ctrack',
    '/favorites?tab=music',
  ],
  [
    {
      publicPath: '/share/dir/token?path=nested&file=track',
      publicPlaylistPath: '/share/dir/token?path=nested',
    },
    '/share/dir/token?path=nested&file=track',
    '/share/dir/token?path=nested',
  ],
  [{ publicPath: '/share/token', directoryId: 'private' }, '/share/token', undefined],
] as const)('uses the playback queue for playlist navigation (%j)', (queue, file, playlist) => {
  playback.useAudioPlayback.setState({
    track: { id: 'track', name: 'Трек.mp3', src: '/audio.mp3', collection: 'Плейлист', ...queue },
    compact: true,
  });
  render(<DesktopAudioMiniPlayer />);

  const trackLink = screen.getByRole('link', { name: 'Трек.mp3' });
  const playlistLink = screen.queryByRole('link', { name: 'Плейлист' });
  expect(trackLink.getAttribute('href')).toBe(file);
  expect(trackLink.contains(playlistLink)).toBe(false);
  expect(playlistLink?.getAttribute('href')).toBe(playlist);
});
