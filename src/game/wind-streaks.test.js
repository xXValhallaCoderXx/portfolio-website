import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WIND_STREAKS, createWindStreaks } from './wind-streaks.js';
import { ORDER } from './cloudbase.js';
import { CLOUD_GUST, CLOUD_POOL, CLOUD_ZONE, createCloudbaseRun } from './cloudbase-state.js';
import { APPROACH_WINDS, fjordBreeze } from './approach.js';
import { ZONES } from './terrain.js';

const STEP = 1 / 60;
const W = WIND_STREAKS;
// The buffers hold the steady streaks, then the gust fronts' own, then one leading edge per slot.
const STEADY = W.count;
const FRONTS = W.front;
const LEADS = STEADY + FRONTS;
const SEGMENTS = LEADS + CLOUD_POOL.gusts;
// The brightness at which the game's glow starts (the bloom pass in game.js), and how bright a
// colour is by that measure.
const GLOW = 0.3;
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const PALE = new THREE.Color(W.colour);
const WHITE = new THREE.Color(W.gustColour);

const close = (actual, expected, slack) => assert.ok(Math.abs(actual - expected) <= slack, `${actual} is within ${slack} of ${expected}`);
const wrapCentred = (value, span) => value - span * Math.round(value / span);
const range = (from, to) => Array.from({ length: to - from }, (_, n) => from + n);
// Where the game's chase camera sits for a pilot heading `yaw`: 26 m behind and 9.5 m up.
const chase = (pos, yaw = 0) => ({ x: pos.x - 26 * Math.sin(yaw), y: pos.y + 9.5, z: pos.z + 26 * Math.cos(yaw) });

// A wind that blows the same everywhere, and counts how often it is asked.
function blowing(x, z, front = 0) {
  const wind = (px, py, pz, out) => {
    wind.calls += 1;
    out.x = x;
    out.z = z;
    out.front = front;
    return out;
  };
  wind.calls = 0;
  return wind;
}

// Segment `i` as drawn: its two ends, its middle and length, and the colour at each end.
function segment(streaks, i) {
  const place = streaks.lines.geometry.attributes.position.array;
  const colour = streaks.lines.geometry.attributes.color.array;
  const end = (at) => ({ x: place[i * 6 + at], y: place[i * 6 + at + 1], z: place[i * 6 + at + 2] });
  const tail = end(0);
  const head = end(3);
  return {
    tail,
    head,
    mid: { x: (tail.x + head.x) / 2, y: (tail.y + head.y) / 2, z: (tail.z + head.z) / 2 },
    length: Math.hypot(head.x - tail.x, head.y - tail.y, head.z - tail.z),
    tailColour: [colour[i * 6], colour[i * 6 + 1], colour[i * 6 + 2]],
    headColour: [colour[i * 6 + 3], colour[i * 6 + 4], colour[i * 6 + 5]],
  };
}
const drawn = (streaks, from = 0, to = SEGMENTS) => range(from, to).map((i) => segment(streaks, i));
const lit = (part) => part.headColour.some((value) => value > 0) || part.tailColour.some((value) => value > 0);

// How near the point is to the segment from `a` to `b`.
function reachOf(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const length = dx * dx + dy * dy + dz * dz;
  const t = length > 0 ? Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy + (point.z - a.z) * dz) / length)) : 0;
  return Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t, point.z - a.z - dz * t);
}

// Where a point is in a gust band's own frame: metres ahead of its front (inside the band between
// minus its depth and 0) and metres to the right of its middle line.
function inBand(band, point) {
  const dx = point.x - CLOUD_ZONE.x;
  const dz = point.z - CLOUD_ZONE.z;
  return { ahead: dx * band.ux + dz * band.uz - band.at, aside: dz * band.ux - dx * band.uz - band.lane };
}

// Whether a point is clear of a band by more than `margin` metres: ahead of its front, behind its
// back or beside it. A streak's wind is looked up at its middle, a few frames ago at most.
function clearOf(band, point, margin = 3) {
  const { ahead, aside } = inBand(band, point);
  return ahead > margin || ahead < -CLOUD_GUST.depth - margin || Math.abs(aside) > CLOUD_GUST.half + margin;
}

// A real run with one gust band set off by hand, `lane` metres to the right of the zone centre,
// and the pilot hanging still on the band's middle line abeam the centre, at 700 m: well above the
// launch hill's lee, and in the band's path. Facing into it, so the camera is behind, downwind.
// The first scheduled band is never due before 20 seconds, so until then this is the only one.
function gustyRun({ heading = 0.9, lane = 20, strength = 5, seed = 5 } = {}) {
  const run = createCloudbaseRun();
  run.reset(80, seed);
  run.gust(heading, lane, strength);
  const band = run.state.gusts.find((slot) => slot.strength > 0);
  const pos = { x: CLOUD_ZONE.x - band.uz * lane, y: 700, z: CLOUD_ZONE.z + band.ux * lane };
  const eye = chase(pos, heading + Math.PI);
  // Steps the run and draws each frame of `seconds`, as the game does.
  const fly = (streaks, seconds) => {
    for (let n = 0; n < Math.round(seconds * 60); n++) {
      run.step(STEP, pos);
      streaks.update(STEP, pos, eye, run.windAt, 1, run.state.fogHeight + 3, run.state.gusts, false);
    }
  };
  return { run, band, pos, eye, fly };
}

test('the streaks are additive 1 px lines in colours of their own, unfogged, and drawn after the run\'s fog when asked', () => {
  const streaks = createWindStreaks({ scene: new THREE.Scene(), order: ORDER.aboveFog });
  const { lines } = streaks;
  assert.equal(lines.isLineSegments, true);
  assert.equal(lines.name, 'wind-streaks');
  assert.equal(lines.renderOrder, ORDER.aboveFog);
  assert.ok(lines.renderOrder > ORDER.fog, 'the fog, which writes no depth, would otherwise paint over them');
  assert.equal(Object.isFrozen(ORDER), true);
  assert.equal(lines.frustumCulled, false);
  const { material, geometry } = lines;
  assert.equal(material.isLineBasicMaterial, true);
  assert.deepEqual(
    [material.vertexColors, material.blending, material.transparent, material.depthWrite, material.fog],
    [true, THREE.AdditiveBlending, true, false, false],
  );
  assert.deepEqual(Object.keys(geometry.attributes).sort(), ['color', 'position']);
  for (const name of ['position', 'color']) {
    const attribute = geometry.attributes[name];
    assert.equal(attribute.usage, THREE.DynamicDrawUsage);
    assert.equal(attribute.itemSize, 3);
    assert.equal(attribute.count, SEGMENTS * 2);
    assert.equal(attribute.array instanceof Float32Array, true);
  }
  assert.equal(SEGMENTS, 140 + 60 + CLOUD_POOL.gusts);
  assert.equal(createWindStreaks({ scene: new THREE.Scene() }).lines.renderOrder, 0);
  assert.equal(Object.isFrozen(W), true);
});

test('the steady streaks fill a box around the pilot wherever it flies, and no lit one reaches past the box', () => {
  const streaks = createWindStreaks({ scene: new THREE.Scene() });
  const wind = blowing(2.5, -1.5);
  const [width, height, depth] = W.box;
  const pos = { x: 0, y: 300, z: 0 };
  const inside = (point) => Math.abs(point.x - pos.x) <= width / 2 + 1e-3 && Math.abs(point.z - pos.z) <= depth / 2 + 1e-3 &&
    point.y - pos.y >= W.above - height - 1e-3 && point.y - pos.y <= W.above + 1e-3;
  let fewest = Infinity;
  const look = (yaw) => {
    streaks.update(STEP, pos, chase(pos, yaw), wind, 1, -1000, null, false);
    let shown = 0;
    for (const streak of drawn(streaks, 0, STEADY)) {
      assert.ok(inside(streak.mid), `a streak's middle is in the box (${streak.mid.x - pos.x}, ${streak.mid.y - pos.y}, ${streak.mid.z - pos.z})`);
      if (!lit(streak)) continue;
      shown += 1;
      assert.ok(inside(streak.tail) && inside(streak.head), 'a lit streak lies wholly in the box');
    }
    fewest = Math.min(fewest, shown);
  };
  // A climbing circle, a straight glide, and leaps across the map like a teleport's.
  for (let n = 0; n < 300; n++) {
    const yaw = n * STEP * 0.8;
    Object.assign(pos, { x: 14 * Math.sin(yaw), y: 300 + n * STEP * 2, z: -14 * Math.cos(yaw) });
    look(yaw + Math.PI / 2);
  }
  for (let n = 0; n < 300; n++) {
    pos.z -= 11.5 * STEP;
    look(0);
  }
  for (const [x, y, z] of [[4000, 900, -3000], [-250, 120, 610], [0.5, 1500, -0.5]]) {
    Object.assign(pos, { x, y, z });
    for (let n = 0; n < 5; n++) look(1);
  }
  assert.ok(fewest > 0.8 * STEADY, `at least ${fewest} of ${STEADY} streaks were lit at every moment`);
});

test('the field stays put in the world as the pilot flies through it, and moves only with the wind, at flow times its speed', () => {
  for (const calm of [false, true]) {
    const streaks = createWindStreaks({ scene: new THREE.Scene(), calm });
    const flow = calm ? W.calm.flow : W.flow;
    const wind = blowing(2, -1);
    const pos = { x: 30, y: 400, z: -20 };
    streaks.update(STEP, pos, chase(pos), wind, 1, -1000, null, false);
    const before = drawn(streaks, 0, STEADY);
    // A second of flying on at 10 m/s, which moves the box but must not move the streaks.
    for (let n = 0; n < 60; n++) {
      pos.x += 8 * STEP;
      pos.z -= 6 * STEP;
      streaks.update(STEP, pos, chase(pos), wind, 1, -1000, null, false);
    }
    const after = drawn(streaks, 0, STEADY);
    const shown = Math.ceil(STEADY * (calm ? W.calm.share : 1));
    for (let i = 0; i < shown; i++) {
      // Only the place in the box is the streak's own; it comes round again on the far side.
      close(wrapCentred(after[i].mid.x - before[i].mid.x, W.box[0]), flow * 2, 1e-3);
      close(wrapCentred(after[i].mid.y - before[i].mid.y, W.box[1]), 0, 1e-3);
      close(wrapCentred(after[i].mid.z - before[i].mid.z, W.box[2]), flow * -1, 1e-3);
    }
  }
  assert.ok(W.flow > 1 && W.flow < 2, 'a little faster than the air, so a pilot carried by it still sees it go by');
});

test('each streak is a comet pointing downwind, longer and brighter the harder it blows, and none shows in a calm', () => {
  const pos = { x: 0, y: 500, z: 0 };
  // Far overhead, out of the way of the fades around the camera.
  const eye = { x: 0, y: 3000, z: 0 };
  const draw = (wind) => {
    const streaks = createWindStreaks({ scene: new THREE.Scene() });
    streaks.update(STEP, pos, eye, wind, 1, -1000, null, false);
    return drawn(streaks, 0, STEADY);
  };
  // Streaks well in from every face of the box and clear of the camera's line of sight, whose
  // light is down to the wind alone.
  const open = (streak) => Math.abs(streak.mid.x) < W.box[0] / 2 - 30 && Math.abs(streak.mid.z) < W.box[2] / 2 - 30 &&
    streak.mid.y - pos.y > W.above - W.box[1] + 6 && streak.mid.y - pos.y < W.above - 6 && Math.hypot(streak.mid.x, streak.mid.z) > 30;
  const winds = [[1, 0], [0, -2.5], [-2.4, 3.2], [6, 8]];
  const pictures = winds.map(([x, z]) => draw(blowing(x, z)));
  winds.forEach(([x, z], n) => {
    const speed = Math.hypot(x, z);
    const length = Math.min(W.length[1], Math.max(W.length[0], W.stretch * speed));
    const shown = pictures[n].filter(lit);
    assert.ok(shown.length > 0.8 * STEADY);
    for (const streak of shown) {
      const dx = streak.head.x - streak.tail.x;
      const dz = streak.head.z - streak.tail.z;
      assert.ok(Math.abs(dx * z - dz * x) < 1e-4 * speed * streak.length, 'along the wind');
      assert.ok(dx * x + dz * z > 0, 'its head downwind of its tail');
      assert.equal(streak.head.y, streak.tail.y, 'level');
      close(streak.length, length, 1e-3);
      // A comet: dark at the tail, the air's pale colour at the head.
      assert.deepEqual(streak.tailColour, [0, 0, 0]);
      close(streak.headColour[0] / streak.headColour[2], PALE.r / PALE.b, 1e-5);
      close(streak.headColour[1] / streak.headColour[2], PALE.g / PALE.b, 1e-5);
    }
  });
  // Brighter in more wind, streak for streak, by exactly the share the table gives.
  const breeze = (speed) => W.glow[0] + W.glow[1] * speed;
  let compared = 0;
  for (let i = 0; i < STEADY; i++) {
    if (!pictures.every((picture) => open(picture[i]))) continue;
    for (let n = 1; n < winds.length; n++) {
      const ratio = luma(pictures[n][i].headColour) / luma(pictures[0][i].headColour);
      close(ratio, breeze(Math.hypot(...winds[n])) / breeze(1), 1e-4);
    }
    compared += 1;
  }
  assert.ok(compared > 20, `${compared} streaks compared`);
  // The strongest breeze of a run, 4 m/s, stays under the glow's threshold: only gusts bloom.
  assert.ok(Math.max(...pictures[2].map((streak) => luma(streak.headColour))) < GLOW);
  // Under about 0.3 m/s nothing shows; just over it a streak is there, at half its light at most.
  assert.equal(draw(blowing(0.2, 0.15)).some(lit), false);
  const faint = draw(blowing(0.45, 0)).filter(lit);
  assert.ok(faint.length > 0.8 * STEADY);
  assert.ok(Math.max(...faint.map((streak) => luma(streak.headColour))) <= 0.5 * luma(PALE) * breeze(0.45) * (1 + 1e-6));
});

test('a gust band\'s own streaks hang in a curtain inside it, crowded toward its front, long and bright enough to bloom, and travel with it', () => {
  const { band, pos, eye, fly } = gustyRun();
  const streaks = createWindStreaks({ scene: new THREE.Scene() });
  fly(streaks, 9);
  const fronts = drawn(streaks, STEADY, LEADS);
  const shown = fronts.filter(lit);
  assert.ok(shown.length > 0.8 * FRONTS, `${shown.length} of ${FRONTS} are lit`);
  for (const streak of shown) {
    for (const end of [streak.tail, streak.head]) {
      const { ahead, aside } = inBand(band, end);
      assert.ok(ahead < 0 && ahead > -CLOUD_GUST.depth, `${ahead.toFixed(2)} m ahead of the front is inside the band`);
      assert.ok(Math.abs(aside) < CLOUD_GUST.half, `${aside.toFixed(2)} m aside is inside the band`);
      assert.ok(end.y >= pos.y - W.curtain[0] && end.y <= pos.y + W.curtain[1], 'in the curtain around the pilot');
    }
    assert.ok(streak.length >= W.frontLength[0] - 1e-3 && streak.length <= W.frontLength[1] + 1e-3);
    assert.deepEqual(streak.tailColour, [0, 0, 0]);
    // The gust's whiter colour.
    close(streak.headColour[0] / streak.headColour[2], WHITE.r / WHITE.b, 1e-5);
  }
  // Crowded toward the front: half the heads are in the front third of the band.
  const behind = shown.map((streak) => -inBand(band, streak.head).ahead).sort((a, b) => a - b);
  assert.ok(behind[Math.floor(behind.length / 2)] < CLOUD_GUST.depth / 3, `the middle head is ${behind[Math.floor(behind.length / 2)].toFixed(1)} m behind the front`);
  // Longer than the breeze's own streaks out of the band, and most of them bright enough to bloom,
  // where the breeze's never are.
  const breeze = drawn(streaks, 0, STEADY).filter((streak) => lit(streak) && clearOf(band, streak.mid));
  assert.ok(breeze.length > 0.5 * STEADY);
  assert.ok(Math.min(...shown.map((streak) => streak.length)) > Math.max(...breeze.map((streak) => streak.length)));
  assert.ok(shown.filter((streak) => luma(streak.headColour) > GLOW).length > shown.length / 2);
  assert.ok(Math.max(...breeze.map((streak) => luma(streak.headColour))) < GLOW);

  // A second later every one of them is 12 m further on along the band's line, as the band is.
  fly(streaks, 1);
  const later = drawn(streaks, STEADY, LEADS);
  let moved = 0;
  for (let j = 0; j < FRONTS; j++) {
    if (!lit(fronts[j]) || !lit(later[j])) continue;
    close(later[j].mid.x - fronts[j].mid.x, CLOUD_GUST.speed * band.ux, 1e-3);
    close(later[j].mid.y - fronts[j].mid.y, 0, 1e-3);
    close(later[j].mid.z - fronts[j].mid.z, CLOUD_GUST.speed * band.uz, 1e-3);
    moved += 1;
  }
  assert.ok(moved > 0.8 * FRONTS);

  // From far off to one side, only the part of the band within 120 m of the point abeam is drawn.
  const aside = 150;
  Object.assign(pos, { x: pos.x - band.uz * aside, z: pos.z + band.ux * aside });
  Object.assign(eye, chase(pos, Math.atan2(band.ux, -band.uz) + Math.PI));
  fly(streaks, STEP);
  const wide = drawn(streaks, STEADY, LEADS).filter(lit);
  assert.ok(wide.length > 0, 'the near side of the band still shows');
  for (const streak of wide) assert.ok(Math.abs(inBand(band, streak.mid).aside - aside) < W.window[1]);
});

test('each live front draws its leading edge as one faint line across the zone, as wide as its band and a few metres under the pilot', () => {
  const { run, band, pos, fly } = gustyRun();
  const streaks = createWindStreaks({ scene: new THREE.Scene() });
  const edges = () => drawn(streaks, LEADS, SEGMENTS);
  // Still outside the zone: the band's own streaks show it coming, but there is no edge to draw.
  fly(streaks, 5);
  assert.ok(band.at < -CLOUD_ZONE.r);
  assert.ok(drawn(streaks, STEADY, LEADS).some(lit));
  assert.equal(edges().some(lit), false);
  fly(streaks, 4);
  const slot = run.state.gusts.indexOf(band);
  edges().forEach((edge, s) => assert.equal(lit(edge), s === slot, `slot ${s} ${s === slot ? 'has' : 'has no'} edge`));
  const edge = segment(streaks, LEADS + slot);
  for (const end of [edge.tail, edge.head]) {
    const { ahead, aside } = inBand(band, end);
    close(ahead, 0, 1e-3);
    assert.ok(Math.abs(aside) <= CLOUD_GUST.half + 1e-3, 'within the band');
    assert.ok(Math.hypot(end.x - CLOUD_ZONE.x, end.z - CLOUD_ZONE.z) <= CLOUD_ZONE.r + 1e-3, 'within the zone');
    close(end.y, pos.y - W.lead.drop, 1e-3);
  }
  // All of the front that is both in the band and in the zone.
  const chord = Math.sqrt(CLOUD_ZONE.r ** 2 - band.at ** 2);
  close(edge.length, Math.min(chord, band.lane + CLOUD_GUST.half) - Math.max(-chord, band.lane - CLOUD_GUST.half), 1e-2);
  // Faint and even: the same pale colour along its length, not bright enough to bloom.
  assert.deepEqual(edge.tailColour, edge.headColour);
  close(edge.headColour[0] / edge.headColour[2], PALE.r / PALE.b, 1e-5);
  assert.ok(luma(edge.headColour) > 0.1 && luma(edge.headColour) < GLOW, `the edge is ${luma(edge.headColour).toFixed(3)} bright`);
});

test('with no gust in the sky, or none to be had over the fjord, no gust streak and no leading edge is drawn', () => {
  const { run, pos, eye, fly } = gustyRun();
  const streaks = createWindStreaks({ scene: new THREE.Scene() });
  const gustDrawn = () => drawn(streaks, STEADY, SEGMENTS).some(lit);
  fly(streaks, 9);
  assert.equal(gustDrawn(), true);
  // The same run over the fjord's breeze, with no gusts handed over: all of it goes at once.
  streaks.update(STEP, pos, eye, fjordBreeze, 0.35, 3, null, false);
  assert.equal(gustDrawn(), false);
  streaks.update(STEP, pos, eye, run.windAt, 1, 3, run.state.gusts, false);
  // A fresh run has every slot empty, and an empty slot draws nothing, at once, though the breeze
  // is drawn as ever.
  run.reset(80, 5);
  streaks.update(STEP, pos, eye, run.windAt, 1, 3, run.state.gusts, false);
  assert.equal(run.state.gusts.every((slot) => slot.strength === 0), true);
  assert.equal(gustDrawn(), false);
  fly(streaks, 2);
  assert.equal(gustDrawn(), false);
  assert.ok(drawn(streaks, 0, STEADY).filter(lit).length > 0.8 * STEADY);
});

test('over the fjord, with fjordBreeze as the wind, fewer streaks show and those near each landing ring point along its windsock', () => {
  let checked = 0;
  for (const zone of ZONES) {
    const sock = APPROACH_WINDS.find((wind) => wind.id === zone.id);
    const streaks = createWindStreaks({ scene: new THREE.Scene() });
    const pos = { x: zone.x, y: zone.h + 30, z: zone.z };
    const eye = chase(pos);
    for (let n = 0; n < 5 * 60; n++) {
      streaks.update(STEP, pos, eye, fjordBreeze, 0.35, 3, null, false);
      const steady = drawn(streaks, 0, STEADY);
      assert.equal(steady.slice(Math.ceil(STEADY * 0.35)).some(lit), false, 'only a share of the streaks is used');
      for (const streak of steady) {
        if (!lit(streak) || Math.hypot(streak.mid.x - zone.x, streak.mid.z - zone.z) > 1.3 * zone.r) continue;
        const dx = streak.head.x - streak.tail.x;
        const dz = streak.head.z - streak.tail.z;
        assert.ok(Math.abs(dx * sock.z - dz * sock.x) < 1e-3 * streak.length, `a streak by the ${zone.id} ring lies along its windsock`);
        assert.ok(dx * sock.x + dz * sock.z > 0, 'and points the way the sock trails');
        checked += 1;
      }
    }
    assert.equal(drawn(streaks, STEADY, SEGMENTS).some(lit), false, 'no gusts over the fjord');
    streaks.dispose();
  }
  assert.ok(checked > 400, `${checked} streaks checked against a windsock`);
});

test('a streak coming into use, or put somewhere else with the pilot, draws the wind of its new place at once', () => {
  // West of x = 1000 the air blows east, beyond it south.
  const split = (x, y, z, out) => {
    out.x = x < 1000 ? 3 : 0;
    out.z = x < 1000 ? 0 : 3;
    out.front = 0;
    return out;
  };
  const streaks = createWindStreaks({ scene: new THREE.Scene() });
  const pos = { x: 0, y: 300, z: 0 };
  const along = (wind) => (streak) => !lit(streak) || (Math.abs((streak.head.x - streak.tail.x) * wind[1] - (streak.head.z - streak.tail.z) * wind[0]) < 1e-3 &&
    (streak.head.x - streak.tail.x) * wind[0] + (streak.head.z - streak.tail.z) * wind[1] > 0);
  // Over the fjord a share is in use; the rest come in as the run begins, each already blowing.
  for (let n = 0; n < 30; n++) streaks.update(STEP, pos, chase(pos), split, 0.35, -1000, null, false);
  streaks.update(STEP, pos, chase(pos), split, 1, -1000, null, false);
  const all = drawn(streaks, 0, STEADY);
  assert.ok(all.filter(lit).length > 0.8 * STEADY);
  assert.equal(all.every(along([3, 0])), true);
  // A teleport across the line: every streak takes the new wind in the first frame there.
  pos.x = 5000;
  streaks.update(STEP, pos, chase(pos), split, 1, -1000, null, false);
  assert.equal(drawn(streaks, 0, STEADY).every(along([0, 3])), true);
});

test('a band blowing out beyond the zone has faded away before the run drops it, so none of it is seen to vanish', () => {
  const { run, band, fly } = gustyRun();
  const streaks = createWindStreaks({ scene: new THREE.Scene() });
  const ofBand = () => drawn(streaks, STEADY, LEADS).filter((streak) => lit(streak) && !clearOf(band, streak.mid, 0));
  fly(streaks, 25);
  assert.ok(ofBand().length > 0.3 * FRONTS, 'crossing the zone it is drawn in full');
  // The band goes once all of it is as far beyond the zone as it started short of it.
  const life = (2 * CLOUD_GUST.start + CLOUD_GUST.depth) / CLOUD_GUST.speed;
  fly(streaks, life - 25 - 0.2);
  assert.ok(band.strength > 0, 'still in the sky');
  assert.equal(ofBand().length, 0);
  fly(streaks, 0.4);
  assert.equal(band.strength === 0 || band.born > 0, true, 'dropped, or its slot already taken by a new band');
  assert.ok(run.state.elapsed > life);
});

test('odd moments never put a number astray: no floor, the camera on the glider, a dead calm, a pilot far off the map', () => {
  const { run, pos, fly } = gustyRun();
  const streaks = createWindStreaks({ scene: new THREE.Scene() });
  fly(streaks, 9);
  const finite = () => {
    const { position, color } = streaks.lines.geometry.attributes;
    assert.equal(position.array.every(Number.isFinite), true);
    assert.equal(color.array.every((value) => Number.isFinite(value) && value >= 0), true);
  };
  streaks.update(STEP, pos, chase(pos), run.windAt, 1, undefined, run.state.gusts, false);
  finite();
  assert.ok(drawn(streaks).some(lit), 'with no floor nothing is cut off');
  streaks.update(STEP, pos, { x: pos.x, y: pos.y + W.rise, z: pos.z }, run.windAt, 1, 0, run.state.gusts, false);
  finite();
  streaks.update(STEP, pos, pos, blowing(0, 0), 1, 0, run.state.gusts, false);
  finite();
  const far = { x: 1e6, y: 5e4, z: -1e6 };
  streaks.update(STEP, far, chase(far), blowing(2, 2), 1, 0, null, true);
  finite();
  streaks.update(1e3, far, chase(far), blowing(2, 2), 1, 0, null, false);
  finite();
});

test('no lit streak comes close to the camera, cuts across the line of sight to the glider or hangs under the floor', () => {
  const streaks = createWindStreaks({ scene: new THREE.Scene() });
  const wind = blowing(3, -2);
  const pos = { x: 0, y: 200, z: 0 };
  let dimmed = 0;
  for (let n = 0; n < 300; n++) {
    // Circling, with the floor cutting through the bottom of the box.
    const yaw = n * STEP * 0.8 + Math.PI / 2;
    Object.assign(pos, { x: 14 * Math.sin(yaw - Math.PI / 2), z: -14 * Math.cos(yaw - Math.PI / 2) });
    const eye = chase(pos, yaw);
    const glider = { x: pos.x, y: pos.y + W.rise, z: pos.z };
    const floor = pos.y - 5;
    streaks.update(STEP, pos, eye, wind, 1, floor, null, false);
    for (const streak of drawn(streaks, 0, STEADY)) {
      if (!lit(streak)) continue;
      assert.ok(streak.mid.y > floor, 'nothing lit under the floor');
      assert.ok(reachOf(eye, streak.tail, streak.head) > W.near[0], 'nothing lit right by the camera');
      // Stepped along the streak: how near it comes to the line of sight.
      let nearest = Infinity;
      for (let t = 0; t <= 1; t += 1 / 64) {
        const point = { x: streak.tail.x + (streak.head.x - streak.tail.x) * t, y: streak.tail.y, z: streak.tail.z + (streak.head.z - streak.tail.z) * t };
        nearest = Math.min(nearest, reachOf(point, eye, glider));
      }
      assert.ok(nearest > W.clear[0] - 0.25, `a lit streak passes ${nearest.toFixed(2)} m from the line of sight`);
      if (reachOf(eye, streak.tail, streak.head) < W.near[1] || nearest < W.clear[1]) dimmed += 1;
    }
  }
  assert.ok(dimmed > 0, 'streaks near the camera are dimmed, not all put out');
});

test('the air is drawn pale blue, a gust whiter, and nothing is ever amber or red', () => {
  const { run, band, fly } = gustyRun();
  const streaks = createWindStreaks({ scene: new THREE.Scene() });
  const hues = () => drawn(streaks).filter(lit).map((part) => part.headColour);
  const blueWhite = ([r, g, b]) => b >= g && g >= r && r > 0;
  const whiteness = (streak) => streak.headColour[0] / streak.headColour[2];
  // Out of the band, a steady streak is the air's own colour.
  fly(streaks, 9);
  const clear = drawn(streaks, 0, STEADY).filter((streak) => lit(streak) && clearOf(band, streak.mid));
  assert.ok(clear.length > 0.5 * STEADY);
  for (const streak of clear) close(whiteness(streak), PALE.r / PALE.b, 1e-5);
  assert.ok(hues().every(blueWhite));
  // Over the pilot: the steady streaks well inside the band go the gust's white.
  fly(streaks, 10);
  assert.equal(run.state.gusts.filter((slot) => slot.strength > 0).length, 1);
  const deep = drawn(streaks, 0, STEADY).filter((streak) => {
    const { ahead, aside } = inBand(band, streak.mid);
    return lit(streak) && ahead < -CLOUD_GUST.rise - 2 && ahead > CLOUD_GUST.fall - CLOUD_GUST.depth + 2 && Math.abs(aside) < CLOUD_GUST.half - CLOUD_GUST.soft - 2;
  });
  assert.ok(deep.length >= 5, `${deep.length} steady streaks are deep in the band`);
  for (const streak of deep) close(whiteness(streak), WHITE.r / WHITE.b, 1e-5);
  assert.ok(hues().every(blueWhite));
  // And so on through the next bands.
  for (let n = 0; n < 6; n++) {
    fly(streaks, 5);
    assert.ok(hues().every(blueWhite));
  }
});

test('once the game has dropped its glow every streak is drawn brighter, by the same share', () => {
  const { run, pos, eye } = gustyRun();
  const plain = createWindStreaks({ scene: new THREE.Scene() });
  const bright = createWindStreaks({ scene: new THREE.Scene() });
  // Two sets drawn from one run, gust and all: it is stepped once a frame and both are drawn.
  for (let n = 0; n < 9 * 60; n++) {
    run.step(STEP, pos);
    plain.update(STEP, pos, eye, run.windAt, 1, run.state.fogHeight + 3, run.state.gusts, false);
    bright.update(STEP, pos, eye, run.windAt, 1, run.state.fogHeight + 3, run.state.gusts, true);
  }
  const a = plain.lines.geometry.attributes.color.array;
  const b = bright.lines.geometry.attributes.color.array;
  let some = 0;
  for (let i = 0; i < a.length; i++) {
    close(b[i], a[i] * W.unbloomed, 1e-6);
    if (a[i] > 0) some += 1;
  }
  assert.ok(some > 300);
  assert.ok(W.unbloomed > 1);
});

test('under reduced motion fewer streaks show, none of them twinkles, and the field moves with the air', () => {
  const wind = blowing(2, 1);
  for (const calm of [true, false]) {
    const streaks = createWindStreaks({ scene: new THREE.Scene(), calm });
    const flow = calm ? W.calm.flow : W.flow;
    // A pilot carried at exactly the streaks' own speed sees every one of them hold still, so any
    // change in a streak's light can only be its twinkle.
    const pos = { x: 0, y: 300, z: 0 };
    let first = null;
    let most = 0;
    let shown = 0;
    for (let n = 0; n < 5 * 60; n++) {
      pos.x += 2 * flow * STEP;
      pos.z += 1 * flow * STEP;
      streaks.update(STEP, pos, chase(pos), wind, 1, -1000, null, false);
      const lights = drawn(streaks, 0, STEADY).map((streak) => luma(streak.headColour));
      shown = Math.max(shown, lights.filter((light) => light > 0).length);
      if (!first) first = lights;
      else most = Math.max(most, ...lights.map((light, i) => Math.abs(light - first[i])));
    }
    if (calm) {
      assert.ok(most < 1e-4, `a streak's light changed by ${most}`);
      assert.ok(shown <= Math.ceil(STEADY * W.calm.share), `${shown} streaks shown`);
    } else {
      assert.ok(most > 0.02, 'the usual streaks twinkle');
      assert.ok(shown > Math.ceil(STEADY * W.calm.share));
    }
  }
});

test('level 0 hides the streaks, blanks them and then does no work at all', () => {
  const streaks = createWindStreaks({ scene: new THREE.Scene() });
  const { position, color } = streaks.lines.geometry.attributes;
  const wind = blowing(3, 1);
  const pos = { x: 10, y: 250, z: 10 };
  assert.equal(streaks.lines.visible, false, 'nothing shows before the first update');
  for (let n = 0; n < 30; n++) streaks.update(STEP, pos, chase(pos), wind, 1, -1000, null, false);
  assert.equal(streaks.lines.visible, true);
  assert.ok(drawn(streaks).filter(lit).length > 0.8 * STEADY);
  streaks.update(STEP, pos, chase(pos), wind, 0, -1000, null, false);
  assert.equal(streaks.lines.visible, false);
  assert.equal(color.array.every((value) => value === 0), true);
  const places = position.array.slice();
  const versions = [position.version, color.version];
  wind.calls = 0;
  for (const level of [0, -1, NaN, undefined, null]) {
    for (let n = 0; n < 20; n++) {
      pos.x += 5;
      streaks.update(STEP, pos, chase(pos), wind, level, -1000, null, false);
    }
  }
  assert.equal(wind.calls, 0);
  assert.deepEqual(position.array, places);
  assert.equal(color.array.every((value) => value === 0), true);
  assert.deepEqual([position.version, color.version], versions);
  assert.equal(streaks.lines.visible, false);
  // It comes back whole.
  streaks.update(STEP, pos, chase(pos), wind, 1, -1000, null, false);
  assert.equal(streaks.lines.visible, true);
  assert.ok(drawn(streaks).filter(lit).length > 0.8 * STEADY);
});

test('with dt 0 nothing moves and the picture holds, gusts and all, as it must while the map is open', () => {
  const { run, pos, eye } = gustyRun();
  const streaks = createWindStreaks({ scene: new THREE.Scene() });
  let calls = 0;
  const windAt = (x, y, z, out) => {
    calls += 1;
    return run.windAt(x, y, z, out);
  };
  const draw = (dt) => streaks.update(dt, pos, eye, windAt, 1, run.state.fogHeight + 3, run.state.gusts, false);
  const fly = (seconds) => {
    for (let n = 0; n < Math.round(seconds * 60); n++) {
      run.step(STEP, pos);
      draw(STEP);
    }
  };
  fly(9);
  // A second band sets off just before the map opens, so some streaks are half way from one band
  // to the other when time stops.
  run.gust(2.4, -30, 4);
  fly(0.2);
  const { position, color } = streaks.lines.geometry.attributes;
  const places = position.array.slice();
  const colours = color.array.slice();
  assert.ok(drawn(streaks, STEADY, SEGMENTS).some(lit), 'a gust is being drawn');
  calls = 0;
  // The map is open: the run is not stepped and every frame passes no time.
  for (let n = 0; n < 120; n++) draw(0);
  assert.deepEqual(position.array, places);
  assert.deepEqual(color.array, colours);
  assert.equal(calls, 0, 'nothing is looked up again while nothing moves');
  // Closed again, it carries on.
  run.step(STEP, pos);
  draw(STEP);
  assert.notDeepEqual(position.array, places);
});

test('after 600 frames the streaks still draw into the same buffers, and no new array is made along the way', () => {
  const scene = new THREE.Scene();
  const { run, pos, eye } = gustyRun();
  const streaks = createWindStreaks({ scene });
  const { lines } = streaks;
  const { geometry, material } = lines;
  const { position, color } = geometry.attributes;
  const arrays = [position.array, color.array];
  // Every kind of array is counted as it is made while the streaks are drawing.
  const kinds = ['Array', 'ArrayBuffer', 'Float32Array', 'Float64Array', 'Int8Array', 'Uint8Array', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array'];
  const real = kinds.map((name) => globalThis[name]);
  let made = 0;
  const counting = kinds.map((name, i) => new Proxy(real[i], { construct(target, args, newTarget) { made += 1; return Reflect.construct(target, args, newTarget); } }));
  for (let n = 0; n < 600; n++) {
    run.step(STEP, pos);
    // Climbing in a circle, so that the box, the curtain and the camera all move.
    Object.assign(pos, { x: pos.x + 0.2 * Math.sin(n / 40), y: pos.y + 0.05, z: pos.z + 0.2 * Math.cos(n / 40) });
    Object.assign(eye, chase(pos, n / 40 + Math.PI / 2));
    kinds.forEach((name, i) => { globalThis[name] = counting[i]; });
    try {
      streaks.update(STEP, pos, eye, run.windAt, 1, run.state.fogHeight + 3, run.state.gusts, false);
    } finally {
      kinds.forEach((name, i) => { globalThis[name] = real[i]; });
    }
  }
  assert.equal(made, 0, `${made} arrays were made while drawing`);
  assert.equal(lines.geometry, geometry);
  assert.equal(lines.material, material);
  assert.equal(geometry.attributes.position, position);
  assert.equal(geometry.attributes.color, color);
  assert.deepEqual([position.array, color.array].map((array, i) => array === arrays[i]), [true, true]);
  assert.deepEqual(Object.keys(geometry.attributes).sort(), ['color', 'position']);
  assert.equal(position.count, SEGMENTS * 2);
  assert.deepEqual(scene.children, [lines]);
  assert.ok(drawn(streaks, STEADY, SEGMENTS).some(lit), 'gusts were drawn along the way');
});

test('dispose takes the streaks out of the scene and releases their geometry and material once, and a second game has its own', () => {
  const scene = new THREE.Scene();
  const streaks = createWindStreaks({ scene });
  const other = createWindStreaks({ scene });
  // A React remount makes a second game: nothing of one set is shared with the other.
  assert.notEqual(other.lines.geometry, streaks.lines.geometry);
  assert.notEqual(other.lines.geometry.attributes.position.array, streaks.lines.geometry.attributes.position.array);
  assert.notEqual(other.lines.material, streaks.lines.material);
  const pos = { x: 0, y: 300, z: 0 };
  for (let n = 0; n < 10; n++) streaks.update(STEP, pos, chase(pos), blowing(2, 2), 1, -1000, null, false);
  assert.equal(other.lines.geometry.attributes.color.array.every((value) => value === 0), true, 'drawing one leaves the other alone');
  const released = { geometry: 0, material: 0 };
  streaks.lines.geometry.addEventListener('dispose', () => { released.geometry += 1; });
  streaks.lines.material.addEventListener('dispose', () => { released.material += 1; });
  streaks.dispose();
  streaks.dispose();
  assert.deepEqual(released, { geometry: 1, material: 1 });
  assert.equal(streaks.lines.parent, null);
  assert.deepEqual(scene.children, [other.lines]);
  // Drawing after dispose does nothing, and does not throw.
  const wind = blowing(2, 2);
  streaks.update(STEP, pos, chase(pos), wind, 1, -1000, null, false);
  assert.equal(wind.calls, 0);
  assert.deepEqual(scene.children, [other.lines]);
  other.dispose();
  assert.equal(scene.children.length, 0);
});
