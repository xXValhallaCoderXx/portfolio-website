import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// Native dialogs own focus and dismiss only the newest window. Keep the sheet list for the
// page's scroll lock and to avoid restoring focus beneath a newer sheet during cleanup.
const open = [];
const focusable =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * A terminal window opened over whatever is underneath: the page, or a landing panel in flight.
 * `title` is what its bar says and `label` is its name for screen readers.
 */
export default function Sheet({ title, label, onClose, className = '', children }) {
  const latest = useRef(onClose);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  latest.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    open.push(dialog);
    document.documentElement.classList.add('reading');
    if (!dialog.open) dialog.showModal();
    closeRef.current?.focus();

    return () => {
      const wasTop = open.at(-1) === dialog;
      open.splice(open.indexOf(dialog), 1);
      if (dialog.open) dialog.close();
      if (open.length === 0) document.documentElement.classList.remove('reading');
      if (wasTop && trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, []);

  const onKeyDown = (event) => {
    // Let controls inside the dialog receive their keys before stopping the flight's global
    // handlers. Capture-phase interception would also block button and slider interaction.
    event.stopPropagation();
    if (event.key !== 'Tab') return;

    const controls = [...dialogRef.current.querySelectorAll(focusable)].filter(
      (element) => element.getClientRects().length > 0 && element.tabIndex >= 0,
    );
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-label={label}
      onClick={(event) => event.target === event.currentTarget && latest.current()}
      onKeyDown={onKeyDown}
      onKeyUp={(event) => event.stopPropagation()}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.target === dialogRef.current) latest.current();
      }}
    >
      <section className={`window readme${className ? ` ${className}` : ''}`}>
        <header>
          <i aria-hidden="true" />
          <i aria-hidden="true" />
          <i aria-hidden="true" />
          <span>{title}</span>
          <button
            ref={closeRef}
            type="button"
            className="link close"
            onClick={onClose}
            autoFocus
            aria-label={`Close ${label}`}
          >
            [ <kbd>esc: </kbd>close ]
          </button>
        </header>
        {children}
      </section>
    </dialog>,
    document.body,
  );
}
