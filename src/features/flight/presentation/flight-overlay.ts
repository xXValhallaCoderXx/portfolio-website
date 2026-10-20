const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** One modal focus boundary, shared by the menu, map, confirmation and lazy briefing. */
export function createFlightOverlay(stage: HTMLElement, signal: AbortSignal) {
  const document = stage.ownerDocument;
  let active: HTMLElement | null = null;
  let opener: HTMLElement | null = null;
  const visible = (node: HTMLElement) => node.isConnected && !node.closest('[hidden]') && node.getClientRects().length > 0;
  const choices = () => active ? [...active.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible) : [];
  function focus() {
    if (!active) return;
    const preferred = active.querySelector<HTMLElement>('[data-overlay-focus]');
    const target = preferred && visible(preferred) ? preferred : choices()[0] ?? active;
    if (target === active && !active.hasAttribute('tabindex')) active.tabIndex = -1;
    target.focus({ preventScroll: true });
  }
  document.addEventListener('keydown', (event) => {
    if (!active || event.key !== 'Tab') return;
    const targets = choices(), first = targets[0], last = targets[targets.length - 1];
    if (!first || !active.contains(document.activeElement) || event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      if (event.shiftKey && last) last.focus({ preventScroll: true });
      else if (first) first.focus({ preventScroll: true });
      else focus();
    }
  }, { signal });
  document.addEventListener('focusin', (event) => {
    if (active && !active.contains(event.target as Node)) focus();
  }, { signal });
  return {
    activate(element: HTMLElement) {
      if (active === element) return;
      if (!active) opener = document.activeElement as HTMLElement | null;
      active = element;
      focus();
    },
    deactivate(restore = true) {
      if (!active) return;
      active = null;
      const target = restore && opener && visible(opener) ? opener : stage;
      opener = null;
      if (target === stage && !stage.hasAttribute('tabindex')) stage.tabIndex = -1;
      target.focus({ preventScroll: true });
    },
    focus,
  };
}
