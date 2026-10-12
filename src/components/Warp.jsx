import { useEffect, useRef } from 'react';

const DURATION = 950;
const MIDPOINT = 0.45;
const COLOURS = ['#ffffff', '#9fe8ff', '#3b9eff', '#2dd4ee'];

/**
 * A burst of star streaks that covers the window while the page and the flight change places.
 * `onMidpoint` fires when the window is fully covered, which is the moment to make the swap.
 */
export default function Warp({ onMidpoint, onDone }) {
  const canvas = useRef(null);
  const latest = useRef({});
  latest.current = { onMidpoint, onDone };

  useEffect(() => {
    const el = canvas.current;
    const scale = Math.min(devicePixelRatio, 1.5);
    el.width = innerWidth * scale;
    el.height = innerHeight * scale;
    const ctx = el.getContext('2d');
    const cx = el.width / 2;
    const cy = el.height / 2;
    const reach = Math.hypot(cx, cy);
    const stars = Array.from({ length: 260 }, () => ({
      angle: Math.random() * Math.PI * 2,
      start: Math.random(),
      speed: 0.5 + Math.random() * 1.1,
      width: 0.6 + Math.random() * 1.8,
      colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
    }));

    const began = performance.now();
    let crossed = false;
    let request = 0;

    function draw(now) {
      const t = Math.min(1, (now - began) / DURATION);
      // Builds to full strength at the midpoint, then falls away.
      const power = t < MIDPOINT ? (t / MIDPOINT) ** 2 : Math.max(0, 1 - ((t - MIDPOINT) / (1 - MIDPOINT)) ** 1.5);

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.fillStyle = `rgba(6, 10, 19, ${Math.min(1, power * 1.15)})`;
      ctx.fillRect(0, 0, el.width, el.height);

      // Each star runs outward from the centre, stretching into a longer streak as the warp builds.
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const star of stars) {
        const from = ((star.start + t * star.speed * 1.6) % 1) ** 1.6 * reach;
        const to = from + (0.01 + power * 0.42) * (from + reach * 0.08);
        const cos = Math.cos(star.angle);
        const sin = Math.sin(star.angle);
        ctx.strokeStyle = star.colour;
        ctx.globalAlpha = Math.min(1, power * 1.4) * (0.35 + (0.65 * from) / reach);
        ctx.lineWidth = star.width * scale * (0.6 + power);
        ctx.beginPath();
        ctx.moveTo(cx + cos * from, cy + sin * from);
        ctx.lineTo(cx + cos * to, cy + sin * to);
        ctx.stroke();
      }

      // A flash at the midpoint hides the swap itself.
      const flash = Math.max(0, 1 - Math.abs(t - MIDPOINT) / 0.13);
      if (flash > 0) {
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach);
        glow.addColorStop(0, `rgba(210, 245, 255, ${flash})`);
        glow.addColorStop(0.5, `rgba(59, 158, 255, ${flash * 0.55})`);
        glow.addColorStop(1, 'rgba(59, 158, 255, 0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, el.width, el.height);
      }

      if (!crossed && t >= MIDPOINT) {
        crossed = true;
        latest.current.onMidpoint();
      }
      if (t < 1) request = requestAnimationFrame(draw);
      else latest.current.onDone();
    }

    request = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(request);
  }, []);

  return <canvas className="warp" ref={canvas} aria-hidden="true" />;
}
