import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Toast } from './Toast';

test('a queue notification stays visible until it is dismissed', () => {
  jest.useFakeTimers();
  try {
    const onClose = jest.fn();
    render(<Toast message="Файл в очереди" variant="pending" onClose={onClose} />);
    act(() => jest.advanceTimersByTime(20_000));
    expect(screen.getByText('Файл в очереди')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть уведомление' }));
    act(() => jest.advanceTimersByTime(300));
    expect(onClose).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});
