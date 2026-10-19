import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Button from '../atoms/Button.tsx';
import { useDialog } from '../hooks/useDialog.ts';
import WindowHeader from './WindowHeader.tsx';

/** A terminal window shared by pages and landing reports. */
export default function Sheet({ title, label, onClose, className = '', children }: {
  title: string; label: string; onClose: () => void; className?: string; children: ReactNode;
}) {
  const { dialogRef, closeRef, latest, onKeyDown } = useDialog(onClose);
  return createPortal(
    <dialog ref={dialogRef} className="sheet" aria-label={label}
      onClick={(event) => { if (event.target === event.currentTarget) latest.current(); }}
      onKeyDown={onKeyDown} onKeyUp={(event) => event.stopPropagation()}
      onCancel={(event) => {
        event.preventDefault(); event.stopPropagation();
        if (event.target === dialogRef.current) latest.current();
      }}
    >
      <section className={`window readme${className ? ` ${className}` : ''}`}>
        <WindowHeader title={title}>
          <Button ref={closeRef} className="link close" onClick={onClose} autoFocus aria-label={`Close ${label}`}>
            [ <kbd>esc: </kbd>close ]
          </Button>
        </WindowHeader>
        {children}
      </section>
    </dialog>, document.body,
  );
}
