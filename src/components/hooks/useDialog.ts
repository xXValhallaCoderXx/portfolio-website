import { useEffect, useRef, type KeyboardEvent } from 'react';
import { pauseProjectVideos } from '../../adapters/browser/media-attention.service.ts';

const open: HTMLDialogElement[] = [];
const focusable = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Native modal ownership, focus restoration and keyboard containment. */
export function useDialog(onClose: () => void) {
  const latest = useRef(onClose);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  latest.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement;
    pauseProjectVideos();
    open.push(dialog);
    document.documentElement.classList.add('reading');
    if (!dialog.open) dialog.showModal();
    closeRef.current?.focus();
    return () => {
      pauseProjectVideos();
      const wasTop = open.at(-1) === dialog;
      open.splice(open.indexOf(dialog), 1);
      if (dialog.open) dialog.close();
      if (!open.length) document.documentElement.classList.remove('reading');
      if (wasTop && trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    event.stopPropagation();
    if (event.key !== 'Tab') return;
    const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>(focusable) ?? [])]
      .filter((element) => element.getClientRects().length > 0 && element.tabIndex >= 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return { dialogRef, closeRef, latest, onKeyDown };
}
