import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EXPERIENCE } from '../../../domains/portfolio/content.ts';
import type { ExperienceEntry } from '../../../domains/portfolio/portfolio.types.ts';
import { OpenExperience } from '../experience.context.ts';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const initialCamp = () => {
  const hash = history.state?.returnTo?.experience ?? history.state?.experience;
  return EXPERIENCE.some((entry) => entry.hash === hash) ? hash : EXPERIENCE[0].hash;
};

/** The career overview stays mounted while its role pages are being read. */
export function useExperience() {
  const openOnPage = useContext(OpenExperience);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const [compact, setCompact] = useState(false);
  const [selected, setSelected] = useState(initialCamp);
  const [near, setNear] = useState(initialCamp);
  const [pointed, setPointed] = useState<string | null>(null);
  const [reading, setReading] = useState<ExperienceEntry | null>(null);
  const close = useCallback(() => setReading(null), []);
  const lit = pointed ?? near;

  useLayoutEffect(() => {
    const measure = () => {
      const width = root.current?.clientWidth;
      if (width) setCompact(width <= 820);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (compact) return undefined;
    let queued = 0;
    const read = () => {
      queued = 0;
      if (!root.current?.offsetHeight) return;
      const line = innerHeight * 0.42;
      let best: { hash: string; distance: number } | null = null;
      for (const stop of list.current?.querySelectorAll<HTMLLIElement>('li[data-hash]') ?? []) {
        const box = stop.getBoundingClientRect();
        const distance = box.top > line ? box.top - line : box.bottom < line ? line - box.bottom : 0;
        if (!best || distance < best.distance) best = { hash: stop.dataset.hash!, distance };
      }
      if (best) setNear(best.hash);
    };
    const onScroll = () => { queued ||= requestAnimationFrame(read); };
    read();
    addEventListener('scroll', onScroll, { capture: true, passive: true });
    addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(queued);
      removeEventListener('scroll', onScroll, { capture: true });
      removeEventListener('resize', onScroll);
    };
  }, [compact]);

  const choose = useCallback((hash: string) => {
    if (!EXPERIENCE.some((entry) => entry.hash === hash)) return;
    setSelected(hash);
    setNear(hash);
    setPointed(null);
  }, []);

  const pickCamp = (hash: string) => {
    choose(hash);
    requestAnimationFrame(() =>
      list.current?.querySelector(`[data-hash="${hash}"]`)?.scrollIntoView({
        block: 'center', behavior: reducedMotion() ? 'instant' : 'smooth',
      }),
    );
  };
  const read = (event: React.MouseEvent<HTMLAnchorElement>, entry: ExperienceEntry) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    choose(entry.hash);
    if (openOnPage) openOnPage(entry.hash, 'list');
    else setReading(entry);
  };

  return { root, list, compact, selected, reading, close, lit, pickCamp, read, setPointed };
}
