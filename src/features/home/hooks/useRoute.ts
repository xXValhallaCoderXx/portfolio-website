import { useEffect, useRef, type RefObject } from 'react';
import { ROUTE } from '../../../domains/portfolio/content.ts';
import { contourTile } from '../services/contours.service.ts';
import { pathThrough, SWING, TAKE_OFF } from '../services/route.service.ts';
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useRoute(hud: RefObject<HTMLSpanElement | null>) {
  const root = useRef<HTMLElement>(null);
  const line = useRef<SVGPathElement>(null);
  const flown = useRef<SVGPathElement>(null);
  const marker = useRef<SVGGElement>(null);
  const hang = useRef<SVGGElement>(null);

  useEffect(() => {
    const { image, size } = contourTile();
    // On the whole document, so a project's own page is drawn over the same map.
    document.documentElement.style.setProperty('--contours', `url(${image})`);
    document.documentElement.style.setProperty('--contour-size', `${size}px`);
  }, []);

  useEffect(() => {
    const el = root.current!;
    // The path as measured: its length, points sampled along it, and where each waypoint falls.
    let course: { length: number; samples: number[]; top: number; end: number; stops: number[] } | null = null;
    let frame = 0;
    let last = 0;
    let current = -2;
    const glider = { x: 0, y: 0, lean: 0, vx: 0, swing: 0, spin: 0, placed: false };

    const trace = () => {
      // Put away behind a project's own page there is nothing to measure.
      if (!el.offsetWidth) return;
      // Boxes are reported as drawn, and the warp scales the page while it plays. Dividing that
      // scale back out gives positions as laid out, which is what the path is drawn in.
      const box = el.getBoundingClientRect();
      const scaleX = box.width / el.offsetWidth;
      const scaleY = box.height / el.offsetHeight;
      const edge = el.querySelector<HTMLElement>('.margin')!.getBoundingClientRect();
      const margin = { left: box.left + (edge.left - box.left) / scaleX, width: edge.width / scaleX };
      const nodes = [...el.querySelectorAll('[data-node]')].map((node) => {
        const at = node.getBoundingClientRect();
        return { x: (at.left + at.width / 2 - box.left) / scaleX, y: (at.top + at.height / 2 - box.top) / scaleY };
      });
      // How far down the page the route starts, again as laid out.
      let top = 0;
      for (let at: HTMLElement | null = el; at; at = at.offsetParent as HTMLElement | null) top += at.offsetTop;
      // Long stretches between waypoints get extra bends, alternating sides of the margin.
      const points = [nodes[0]];
      for (let i = 1; i < nodes.length; i += 1) {
        const from = nodes[i - 1];
        const to = nodes[i];
        const bends = i > 1 && margin.width > 70 ? Math.max(0, Math.round((to.y - from.y) / 380) - 1) : 0;
        let side = from.x - (margin.left - box.left) > margin.width / 2 ? 0.2 : 0.8;
        for (let k = 1; k <= bends; k += 1) {
          points.push({ x: margin.left - box.left + margin.width * side, y: from.y + ((to.y - from.y) * k) / (bends + 1) });
          side = 1 - side;
        }
        points.push(to);
      }
      const d = pathThrough(points);
      line.current!.setAttribute('d', d);
      flown.current!.setAttribute('d', d);
      const length = line.current!.getTotalLength();
      const samples = [];
      for (let at = 0; at <= length; at += 6) samples.push(line.current!.getPointAtLength(at).y);
      course = { length, samples, top, end: nodes[nodes.length - 1].y, stops: nodes.slice(1, -1).map((node) => node.y) };
      flown.current!.style.strokeDasharray = String(length);
      // The path has moved, so the glider is set down on it again rather than flown across.
      glider.placed = false;
      follow();
    };

    // How far along the path the point at height `y` is. The path only ever descends.
    const lengthAt = (y: number) => {
      const { samples, length } = course!;
      if (y <= samples[0]) return 0;
      if (y >= samples[samples.length - 1]) return length;
      let low = 0;
      let high = samples.length - 1;
      while (high - low > 1) {
        const mid = (low + high) >> 1;
        if (samples[mid] <= y) low = mid;
        else high = mid;
      }
      return (low + (y - samples[low]) / (samples[high] - samples[low])) * 6;
    };

    const draw = (now: number) => {
      frame = 0;
      // Nothing to follow while the page is put away behind a project's own page.
      if (!course || !el.offsetHeight) return;
      // A scroll event can arrive after this frame's timestamp but before its RAF callbacks.
      const dt = now > last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
      last = now;
      // Follow the reader down the viewport, reaching the actual final node at the bottom.
      // On tall screens that node can sit below the usual 80% tracking position.
      const room = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      const progress = room > 0 ? Math.max(0, Math.min(1, scrollY / room)) : 0;
      const startEye = innerHeight * 0.36;
      const finalEye = Math.max(innerHeight * 0.8, course.top + course.end - room);
      const eye = scrollY + startEye + (finalEye - startEye) * progress;
      const along = lengthAt(eye - course.top);
      const target = line.current!.getPointAtLength(along);
      const ahead = line.current!.getPointAtLength(Math.min(course.length, along + 14));
      const lean = Math.atan2(ahead.x - target.x, Math.max(1, ahead.y - target.y)) * -0.7;

      let settled = true;
      // A jump of more than a window or so, such as a link to another section, is not flown through.
      if (still() || !glider.placed || Math.abs(target.y - glider.y) > innerHeight * 1.5) {
        Object.assign(glider, { x: target.x, y: target.y, lean, vx: 0, swing: 0, spin: 0, placed: true });
      } else {
        const ease = 1 - Math.exp(-dt * 12);
        const x = glider.x + (target.x - glider.x) * ease;
        const vx = (x - glider.x) / dt;
        const push = (vx - glider.vx) / dt;
        glider.spin += (-SWING.stiffness * glider.swing - SWING.damping * glider.spin - SWING.push * push) * dt;
        glider.swing = Math.max(-SWING.limit, Math.min(SWING.limit, glider.swing + glider.spin * dt));
        glider.vx = vx;
        glider.x = x;
        glider.y += (target.y - glider.y) * ease;
        glider.lean += (lean - glider.lean) * ease;
        settled =
          Math.hypot(target.x - glider.x, target.y - glider.y) < 0.4 && Math.abs(glider.swing) < 0.004 && Math.abs(glider.spin) < 0.02;
      }
      const degrees = (radians: number) => (radians * 180) / Math.PI;
      marker.current!.setAttribute(
        'transform',
        `translate(${glider.x.toFixed(1)} ${glider.y.toFixed(1)}) rotate(${degrees(glider.lean).toFixed(1)})`,
      );
      hang.current!.setAttribute('transform', `rotate(${degrees(glider.swing).toFixed(1)})`);
      const covered = lengthAt(glider.y);
      flown.current!.style.strokeDashoffset = String(course.length - covered);

      // Which waypoint the glider has reached, for the page, the tabs and the top bar's readout.
      const reached = course.stops.filter((y) => glider.y >= y - 6).length - 1;
      if (reached !== current) {
        current = reached;
        el.querySelectorAll('.waypoint').forEach((waypoint, i) => waypoint.classList.toggle('reached', i <= reached));
      }
      // The standalone report owns /# links. Refresh home tabs even when returning to the
      // same waypoint, since React clears the report's active tab when the page changes.
      document.querySelectorAll('.tabs a[href^="#"]').forEach((tab) => {
        const active = tab.getAttribute('href') === `#${ROUTE[reached]?.id}`;
        if (active && !tab.hasAttribute('aria-current')) tab.setAttribute('aria-current', 'true');
        else if (!active && tab.hasAttribute('aria-current')) tab.removeAttribute('aria-current');
      });
      if (hud?.current) {
        const height = Math.round((TAKE_OFF * (1 - covered / course.length)) / 10) * 10;
        const place = reached < 0 ? 'take-off' : `wpt ${String(reached + 1).padStart(2, '0')} ${ROUTE[reached].id}`;
        hud.current.textContent = `${place} · alt ${height.toLocaleString('en')} m`;
      }
      if (!settled) frame = requestAnimationFrame(draw);
    };

    const follow = () => {
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(draw);
      }
    };

    // The page's length changes when a chapter unfolds or a picture loads; the path is redrawn to fit.
    const watcher = new ResizeObserver(trace);
    watcher.observe(el);
    addEventListener('scroll', follow, { passive: true });
    addEventListener('resize', trace);
    return () => {
      watcher.disconnect();
      cancelAnimationFrame(frame);
      removeEventListener('scroll', follow);
      removeEventListener('resize', trace);
      document.querySelectorAll('.tabs a[href^="#"]').forEach((tab) => tab.removeAttribute('aria-current'));
    };
  }, [hud]);

  return { root, line, flown, marker, hang };
}
