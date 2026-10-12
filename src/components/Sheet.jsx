import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// The sheets open right now, oldest first. One can open over another (a role's details over a
// zoomed pane), and Escape always closes the newest.
const open = [];

// While any sheet is open it owns the keyboard, so keys do not reach the page or the flight behind.
function ownKeys(event) {
  event.stopImmediatePropagation();
  if (event.type === 'keydown' && event.key === 'Escape') open.at(-1)?.();
}

/**
 * A terminal window opened over whatever is underneath: the page, or a landing panel in flight.
 * `title` is what its bar says and `label` is its name for screen readers.
 */
export default function Sheet({ title, label, onClose, children }) {
  const latest = useRef(onClose);
  latest.current = onClose;

  useEffect(() => {
    const close = () => latest.current();
    open.push(close);
    if (open.length === 1) {
      addEventListener('keydown', ownKeys, true);
      addEventListener('keyup', ownKeys, true);
      document.documentElement.classList.add('reading');
    }
    return () => {
      open.splice(open.indexOf(close), 1);
      if (open.length === 0) {
        removeEventListener('keydown', ownKeys, true);
        removeEventListener('keyup', ownKeys, true);
        document.documentElement.classList.remove('reading');
      }
    };
  }, []);

  return createPortal(
    <div className="sheet" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section className="window readme" role="dialog" aria-modal="true" aria-label={label}>
        <header>
          <i />
          <i />
          <i />
          <span>{title}</span>
          <button className="link close" onClick={onClose} autoFocus>
            [ esc: close ]
          </button>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  );
}
