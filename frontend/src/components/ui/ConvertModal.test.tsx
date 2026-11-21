import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConvertModal } from './ConvertModal';
import { startFileConversion } from '../../hooks/useFileConversion';

jest.mock('../../hooks/useFileConversion', () => ({ startFileConversion: jest.fn() }));

test('closes the format picker before the background conversion completes', () => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute('open');
      },
    },
  });
  jest.mocked(startFileConversion).mockReturnValue(new Promise<void>(() => {}));

  function TestScreen() {
    const [open, setOpen] = useState(true);
    return open ? (
      <ConvertModal
        onClose={() => setOpen(false)}
        fileId="file"
        fileName="photo.png"
        mimeType="image/png"
        extension="png"
      />
    ) : null;
  }

  render(<TestScreen />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Выберите формат' }), {
    target: { value: 'webp' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить как WEBP' }));

  expect(screen.queryByRole('dialog')).toBeNull();
  expect(startFileConversion).toHaveBeenCalledWith('file', 'photo.png', 'webp', 'save');
});
