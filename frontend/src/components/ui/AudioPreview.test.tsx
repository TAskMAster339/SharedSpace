import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { AudioPreview } from './AudioPreview';

test('renders themed transport controls and updates native playback position', () => {
  const next = jest.fn();
  render(<AudioPreview name="Ночной рейс" src="/track.mp3" onError={jest.fn()} onNext={next} />);
  const audio = screen.getByLabelText<HTMLAudioElement>('Ночной рейс');
  Object.defineProperty(audio, 'duration', { value: 90 });
  fireEvent.durationChange(audio);
  fireEvent.change(screen.getByRole('slider', { name: 'Позиция воспроизведения' }), {
    target: { value: '30' },
  });
  expect(audio.currentTime).toBe(30);
  fireEvent.click(screen.getByRole('button', { name: 'Следующий трек' }));
  expect(next).toHaveBeenCalledTimes(1);
  const repeat = screen.getByRole('button', { name: 'Повторять трек' });
  fireEvent.click(repeat);
  expect(repeat.getAttribute('aria-pressed')).toBe('true');
  expect(audio.loop).toBe(true);
});

test('keeps the fullscreen shortcut in preview and shows the return control only in fullscreen', () => {
  const onExpand = jest.fn();
  const onCollapse = jest.fn();
  const props = { name: 'Трек', src: '/track.mp3', onError: jest.fn(), onCollapse };
  const { rerender } = render(<AudioPreview {...props} onExpand={onExpand} />);

  expect(screen.queryByRole('button', { name: /Свернуть|Выйти/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Открыть плеер на весь экран' }));
  expect(onExpand).toHaveBeenCalledTimes(1);

  rerender(<AudioPreview {...props} fullScreen />);
  fireEvent.click(screen.getByRole('button', { name: 'Выйти из полноэкранного плеера' }));
  expect(onCollapse).toHaveBeenCalledTimes(1);
});
