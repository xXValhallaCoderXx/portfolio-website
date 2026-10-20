import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlightOverlay } from './flight-overlay.ts';

class Document {
  activeElement: Node | null = null;
  listeners = new Map<string, Set<(event: any) => void>>();
  addEventListener(name: string, callback: (event: any) => void, { signal }: { signal: AbortSignal }) {
    const callbacks = this.listeners.get(name) ?? new Set();
    callbacks.add(callback); this.listeners.set(name, callbacks);
    signal.addEventListener('abort', () => callbacks.delete(callback));
  }
  emit(name: string, event: any) { for (const callback of this.listeners.get(name) ?? []) callback(event); }
}
class Node {
  children: Node[] = []; parent: Node | null = null; hidden = false; isConnected = true; preferred = false; tabIndex = 0;
  constructor(readonly ownerDocument: Document, readonly focusable = false) {}
  append(...children: Node[]) { for (const child of children) { child.parent = this; this.children.push(child); } }
  contains(node: Node | null): boolean { return node === this || this.children.some(child => child.contains(node)); }
  closest(): Node | null { return this.hidden ? this : this.parent?.closest() ?? null; }
  getClientRects() { return this.hidden ? [] : [{}]; }
  hasAttribute() { return false; }
  querySelectorAll(): Node[] { return this.children.flatMap(child => [...(child.focusable ? [child] : []), ...child.querySelectorAll()]); }
  querySelector(): Node | null { return this.querySelectorAll().find(child => child.preferred) ?? null; }
  focus() { this.ownerDocument.activeElement = this; this.ownerDocument.emit('focusin', { target: this }); }
}
function fixture() {
  const document = new Document(), controller = new AbortController(), stage = new Node(document), opener = new Node(document, true);
  const menu = new Node(document), first = new Node(document, true), last = new Node(document, true);
  stage.append(opener, menu); menu.append(first, last); opener.focus();
  const overlay = createFlightOverlay(stage as unknown as HTMLElement, controller.signal);
  const tab = (shiftKey = false) => { const event = { key: 'Tab', shiftKey, prevented: false, preventDefault() { this.prevented = true; } }; document.emit('keydown', event); return event; };
  return { document, controller, stage, opener, menu, first, last, overlay, tab };
}

test('flight dialogs contain keyboard and programmatic focus and restore their opener', () => {
  const f = fixture(); f.overlay.activate(f.menu as unknown as HTMLElement);
  assert.equal(f.document.activeElement, f.first);
  f.last.focus(); assert.equal(f.tab().prevented, true); assert.equal(f.document.activeElement, f.first);
  assert.equal(f.tab(true).prevented, true); assert.equal(f.document.activeElement, f.last);
  f.first.focus(); assert.equal(f.tab().prevented, false, 'ordinary interior Tab keeps native browser order');
  f.opener.focus(); assert.equal(f.document.activeElement, f.first, 'focus outside returns to the current dialog');
  f.overlay.deactivate(); assert.equal(f.document.activeElement, f.opener);
  f.controller.abort();
});

test('switching menu, map and confirmation retains the original opener and skips hidden controls', () => {
  const f = fixture(), map = new Node(f.document), hidden = new Node(f.document, true), cancel = new Node(f.document, true);
  const confirmation = new Node(f.document); hidden.hidden = true; cancel.preferred = true;
  map.append(hidden, confirmation); confirmation.append(cancel); f.stage.append(map);
  f.overlay.activate(f.menu as unknown as HTMLElement);
  f.overlay.activate(map as unknown as HTMLElement); assert.equal(f.document.activeElement, cancel);
  f.overlay.activate(confirmation as unknown as HTMLElement); assert.equal(f.document.activeElement, cancel);
  f.overlay.deactivate(); assert.equal(f.document.activeElement, f.opener);
  f.controller.abort();
});

test('briefing completion or a removed opener leaves focus on the flight stage', () => {
  const f = fixture(); f.overlay.activate(f.menu as unknown as HTMLElement); f.overlay.deactivate(false);
  assert.equal(f.document.activeElement, f.stage);
  f.opener.focus(); f.overlay.activate(f.menu as unknown as HTMLElement); f.opener.isConnected = false;
  f.overlay.deactivate(); assert.equal(f.document.activeElement, f.stage);
  f.controller.abort();
});
