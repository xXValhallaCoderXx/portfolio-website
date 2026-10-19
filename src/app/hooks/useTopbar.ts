import { useEffect, useId, useRef, useState } from 'react';
const COMPACT = '(max-width: 760px), (pointer: coarse) and (max-height: 500px)';

export function useTopbar() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const linksId = useId();

  useEffect(() => {
    const media = matchMedia(COMPACT);
    const resize = () => { if (!media.matches) setOpen(false); };
    const navigate = () => setOpen(false);
    media.addEventListener('change', resize);
    addEventListener('popstate', navigate);
    addEventListener('hashchange', navigate);
    return () => {
      media.removeEventListener('change', resize);
      removeEventListener('popstate', navigate);
      removeEventListener('hashchange', navigate);
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (event: Event) => {
      if (!root.current?.contains(event.target as Node | null)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return { open, setOpen, root, trigger, linksId };
}
