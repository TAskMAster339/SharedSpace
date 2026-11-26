import React from 'react';
import '@testing-library/jest-dom';
import * as playback from '../../store/audioPlaybackStore';
import { fireEvent, render, screen } from '@testing-library/react';
import { AudioPreview } from './AudioPreview';

const initialState = playback.useAudioPlayback.getState();

afterEach(() => {
  playback.useAudioPlayback.setState(initialState);
  jest.restoreAllMocks();
});

test('uses the shared session to seek and switch tracks', () => {
  const session = { id: 'track', name: 'Ночной рейс', src: '/track.mp3', directoryId: 'folder' };
  const seek = jest.spyOn(playback, 'seekTrack').mockImplementation(() => undefined);
  const next = jest.spyOn(playback, 'advanceTrack').mockResolvedValue(undefined);
  playback.useAudioPlayback.setState({ track: session, duration: 90, playing: true });
  render(<AudioPreview name={session.name} session={session} />);

  fireEvent.change(screen.getByRole('slider', { name: 'Позиция воспроизведения' }), {
    target: { value: '30' },
  });
  expect(seek).toHaveBeenCalledWith(30);
  fireEvent.click(screen.getByRole('button', { name: 'Следующий трек' }));
  expect(next).toHaveBeenCalledWith(1);
  expect(screen.getByRole('button', { name: 'Пауза' })).toBeTruthy();
});

test('shows the public track as inactive while the same file is playing privately', () => {
  const track = { id: 'track', name: 'Трек', src: '/track.mp3' };
  playback.useAudioPlayback.setState({ track, duration: 90, playing: true });
  render(<AudioPreview name={track.name} session={{ ...track, publicPath: '/share/token' }} />);

  expect(screen.getByRole('button', { name: 'Воспроизвести' })).toBeTruthy();
  expect(screen.getByRole('slider', { name: 'Позиция воспроизведения' })).toBeDisabled();
});

test('keeps the fullscreen shortcut in preview and shows the return control only in fullscreen', () => {
  const onExpand = jest.fn();
  const onCollapse = jest.fn();
  const props = { name: 'Трек', onCollapse };
  const { rerender } = render(<AudioPreview {...props} onExpand={onExpand} />);

  expect(screen.queryByRole('button', { name: /Свернуть|Выйти/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Открыть плеер на весь экран' }));
  expect(onExpand).toHaveBeenCalledTimes(1);

  rerender(<AudioPreview {...props} fullScreen />);
  fireEvent.click(screen.getByRole('button', { name: 'Выйти из полноэкранного плеера' }));
  expect(onCollapse).toHaveBeenCalledTimes(1);
});

test.each([undefined, '/share/token'])(
  'keeps the track cover non-interactive (%s)',
  (publicPath) => {
    const session = { id: 'track', name: 'Трек', src: '/track.mp3', publicPath };
    render(<AudioPreview name={session.name} cover="/cover.jpg" session={session} />);

    expect(screen.getByAltText('')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Воспроизвести: Трек' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Воспроизвести' })).toBeTruthy();
  },
);
