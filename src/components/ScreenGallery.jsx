import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const clampIndex = (index, count) => Math.max(0, Math.min(index, count - 1));

/** Native modal gallery, portalled outside the site's transformed CRT frame. */
export default function ScreenGallery({ project, initialIndex = 0, onClose }) {
  const screens = project.screens || [];
  const [index, setIndex] = useState(() => clampIndex(initialIndex, screens.length));
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const titleId = useId();
  const captionId = useId();
  const screen = screens[index] || screens[0];

  useEffect(() => {
    setIndex(clampIndex(initialIndex, project.screens?.length || 0));
  }, [project.id, initialIndex, project.screens]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const trigger = document.activeElement;
    const root = document.documentElement;
    const wasLocked = root.classList.contains('gallery-open');
    root.classList.add('gallery-open');
    if (!dialog.open) dialog.showModal();
    closeRef.current?.focus();

    return () => {
      if (dialog.open) dialog.close();
      if (!wasLocked) root.classList.remove('gallery-open');
      if (trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, [project.id]);

  if (!screen) return null;

  const move = (direction) => setIndex((current) => (current + direction + screens.length) % screens.length);

  const onKeyDown = (event) => {
    if (event.key === 'Tab') {
      const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled)')].filter(
        (element) => element.getClientRects().length > 0,
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
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setIndex(screens.length - 1);
    }
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      className="screen-gallery"
      aria-labelledby={titleId}
      aria-describedby={captionId}
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="gallery-head">
        <div>
          <span className="dim">screen gallery</span>
          <h2 id={titleId}>
            {project.title} — {screen.title}
          </h2>
        </div>
        <span className="gallery-count">
          {index + 1} / {screens.length}
        </span>
        <button
          ref={closeRef}
          type="button"
          className="link gallery-close"
          onClick={onClose}
          autoFocus
          aria-label="Close screen gallery"
        >
          [ esc · close × ]
        </button>
      </header>

      <div className={`gallery-media${project.image?.tall ? ' portrait' : ''}`}>
        <img src={screen.src} alt={screen.alt} decoding="async" />
      </div>

      <p className="gallery-caption" id={captionId} aria-live="polite">
        {screen.caption || screen.title}
        {screen.placeholder && (
          <span className="gallery-placeholder"> Temporary preview: this screen uses the current project image.</span>
        )}
      </p>

      <nav className="gallery-controls" aria-label="Gallery navigation">
        <button
          type="button"
          className="link"
          disabled={screens.length < 2}
          onClick={() => move(-1)}
          aria-label="Previous screen"
        >
          [ ← previous ]
        </button>
        <span className="gallery-position" aria-live="polite">
          {String(index + 1).padStart(2, '0')} / {String(screens.length).padStart(2, '0')}
        </span>
        <button
          type="button"
          className="link"
          disabled={screens.length < 2}
          onClick={() => move(1)}
          aria-label="Next screen"
        >
          [ next → ]
        </button>
      </nav>

      <div className="gallery-thumbnails" role="group" aria-label="Select a screen">
        {screens.map((item, itemIndex) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setIndex(itemIndex)}
            aria-pressed={itemIndex === index}
            aria-label={`Show ${item.title}`}
          >
            <img src={item.src} alt="" loading="lazy" decoding="async" />
            <span>{item.title}</span>
          </button>
        ))}
      </div>
    </dialog>,
    document.body,
  );
}
