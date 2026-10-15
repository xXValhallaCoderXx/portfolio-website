import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LIVERIES, LIVERY, liveryPicture, liveryTexture, paintLivery, wingUv } from './livery.js';
import { WINGS } from './wing-kit.js';
import { buildGlider } from './scenery.js';
import { loadModel } from './test-models.js';
import { createSketchpad } from './test-canvas.js';

// The real wing's resting shape, in the wing file's units (1 wide, +x the pilot's left, leading edge
// at +z), as the glider holds it before its first pose.
let resting = null;
async function wingRest() {
  if (resting) return resting;
  const glider = buildGlider({ loadModel });
  assert.equal(await glider.ready, true);
  let wing = null;
  glider.group.traverse((part) => {
    if (part.isMesh && !part.isSkinnedMesh) wing ??= part;
  });
  resting = Float32Array.from(wing.geometry.attributes.position.array);
  return resting;
}

// The wing cut into `count` stations across its span, each with its points' indices.
function stations(rest, count) {
  const cut = Array.from({ length: count }, () => []);
  for (let i = 0; i < rest.length / 3; i++) cut[Math.min(count - 1, Math.max(0, Math.floor((rest[i * 3] + 0.5) * count)))].push(i);
  return cut;
}

const flies = () => new Promise((resolve) => setTimeout(resolve, 0));

test('every wing but the standard one has a livery, named and described, that glows less the paler it is', () => {
  assert.deepEqual(Object.keys(LIVERIES), WINGS.filter((wing) => wing !== 'standard'));
  for (const [id, livery] of Object.entries(LIVERIES)) {
    assert.ok(livery.name && livery.look, id);
    assert.ok(livery.glow > 0 && livery.glow <= 1, `${id} glows ${livery.glow}`);
  }
  // The white wing glows least and the black one most: only the black one's edge is lit.
  const glows = Object.values(LIVERIES).map((livery) => livery.glow);
  assert.equal(LIVERIES.valkyrie.glow, Math.min(...glows));
  assert.equal(LIVERIES.raven.glow, Math.max(...glows));
});

test('a livery lies over the real wing from the pilot\'s left tip to the right, and from the leading edge to the trailing edge at every station of the span', async () => {
  const rest = await wingRest();
  const uv = wingUv(rest);
  assert.equal(uv.length, (rest.length / 3) * 2);
  assert.ok(uv.every((value) => value >= 0 && value <= 1), 'all of it within the picture');
  let left = 0;
  let right = 0;
  for (let i = 0; i < rest.length / 3; i++) {
    if (rest[i * 3] > rest[left * 3]) left = i;
    if (rest[i * 3] < rest[right * 3]) right = i;
  }
  assert.ok(uv[left * 2] < 0.01 && uv[right * 2] > 0.99, 'the left tip is the picture\'s left edge, the right tip its right');
  // At each of forty stations the leading edge is the picture's top row and the trailing edge its
  // bottom, right out to the narrow tips, so an edge painted along the picture reaches them.
  const cut = stations(rest, 40);
  let before = Infinity;
  for (const [k, points] of cut.entries()) {
    assert.ok(points.length > 50, `station ${k} has points`);
    let front = points[0];
    let back = points[0];
    let across = 0;
    for (const i of points) {
      if (rest[i * 3 + 2] > rest[front * 3 + 2]) front = i;
      if (rest[i * 3 + 2] < rest[back * 3 + 2]) back = i;
      across += uv[i * 2];
    }
    assert.ok(uv[front * 2 + 1] >= 0.96, `station ${k}: the leading edge at v ${uv[front * 2 + 1]}`);
    assert.ok(uv[back * 2 + 1] <= 0.04, `station ${k}: the trailing edge at v ${uv[back * 2 + 1]}`);
    // Along the span u only falls, from left (+x) to right.
    const u = across / points.length;
    if (k > 0) assert.ok(u < before, `station ${k}: u ${u} after ${before}`);
    before = u;
  }
  // The wing is the same on either side, and so is its livery.
  for (let k = 0; k < 20; k++) {
    const mean = (points) => points.reduce((sum, i) => sum + uv[i * 2], 0) / points.length;
    assert.ok(Math.abs(mean(cut[k]) + mean(cut[39 - k]) - 1) < 0.01, `stations ${k} and ${39 - k} mirror each other`);
  }
});

test('the span is measured along the arc, so a tenth of the picture covers less of the width out at the curving tips than in the middle', async () => {
  const rest = await wingRest();
  const uv = wingUv(rest);
  const width = (from, to) => {
    let least = Infinity;
    let most = -Infinity;
    for (let i = 0; i < rest.length / 3; i++) {
      if (uv[i * 2] < from || uv[i * 2] >= to) continue;
      least = Math.min(least, rest[i * 3]);
      most = Math.max(most, rest[i * 3]);
    }
    return most - least;
  };
  const tip = width(0, 0.1);
  const middle = width(0.45, 0.55);
  // Measured: 0.082 of the file's width at the tip against 0.111 in the middle.
  assert.ok(tip < 0.85 * middle, `the tip's tenth is ${tip} wide, the middle's ${middle}`);
});

test('wingUv is pure, and a wing of another size or set elsewhere is laid out just the same', async () => {
  const rest = await wingRest();
  const once = wingUv(rest);
  assert.deepEqual(wingUv(rest), once);
  const moved = rest.map((value, i) => (i % 3 === 0 ? value * 2 + 3 : i % 3 === 1 ? value * 2 - 1 : value * 2 + 0.5));
  const again = wingUv(moved);
  for (let i = 0; i < once.length; i++) assert.ok(Math.abs(again[i] - once[i]) < 1e-5, `coordinate ${i}`);
});

test('each livery paints the whole picture first, using nothing a 2-D canvas lacks, and every number it draws with is finite', () => {
  for (const id of Object.keys(LIVERIES)) {
    for (const [width, height] of [[LIVERY.width, LIVERY.height], [192, 48]]) {
      const pad = createSketchpad(width, height);
      paintLivery(pad.getContext('2d'), id, width, height);
      const drawn = pad.calls.filter(([name]) => !['save', 'restore', 'fillStyle', 'strokeStyle', 'createLinearGradient', 'createImageData'].includes(name));
      const [first] = drawn;
      const whole = (first[0] === 'fillRect' && first.slice(1).join() === `0,0,${width},${height}`) ||
        (first[0] === 'putImageData' && first[1].width === width && first[1].height === height);
      assert.ok(whole, `${id} at ${width} x ${height} starts with ${first}`);
      for (const [name, ...args] of pad.calls) {
        for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), `${id}: ${name} with ${args}`);
      }
      // A picture made pixel by pixel is opaque all over.
      for (const [name, image] of pad.calls) {
        if (name === 'putImageData') assert.ok(image.data.every((value, i) => i % 4 !== 3 || value === 255), `${id}: every pixel opaque`);
      }
      assert.equal(pad.calls.filter(([name]) => name === 'save').length, pad.calls.filter(([name]) => name === 'restore').length);
    }
  }
  assert.throws(() => paintLivery(createSketchpad().getContext('2d'), 'standard'), /no livery called standard/);
});

test('a livery\'s texture is painted at once for the wing\'s second set of coordinates, and becomes the owner\'s picture if one loads', async () => {
  const canvas = createSketchpad();
  let asked = null;
  const picture = (id, base) => new Promise((resolve) => (asked = { id, base, resolve }));
  const texture = liveryTexture('raven', { canvas, base: '/site/', picture });
  assert.ok(texture instanceof THREE.CanvasTexture);
  assert.equal(texture.channel, 1, 'it reads uv1');
  assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
  assert.equal(texture.image, canvas);
  assert.deepEqual([canvas.width, canvas.height], [LIVERY.width, LIVERY.height]);
  assert.ok(canvas.calls.some(([name]) => name === 'fillRect'), 'painted before anything loads');
  assert.deepEqual([asked.id, asked.base], ['raven', '/site/']);
  const painted = texture.version;
  let disposed = 0;
  texture.addEventListener('dispose', () => (disposed += 1));
  const owners = { width: LIVERY.picture[0], height: LIVERY.picture[1] };
  asked.resolve(owners);
  await flies();
  // Drawn over the painted one at its own size, on the same canvas.
  assert.equal(texture.image, canvas);
  assert.deepEqual([canvas.width, canvas.height], LIVERY.picture);
  assert.deepEqual(canvas.calls.at(-1), ['drawImage', owners, 0, 0, ...LIVERY.picture]);
  assert.ok(texture.version > painted, 'and is sent to the card again');
  // The texture's room on the graphics card was made for the painted picture, which is smaller:
  // three.js would write the new one into it, which WebGL refuses. Disposed of, it is given room
  // for the new one by the next frame.
  assert.equal(disposed, 1);
  // Where there is no picture, the painted one stays.
  const other = createSketchpad();
  const kept = liveryTexture('hird', { canvas: other, picture: () => Promise.resolve(null) });
  let untouched = true;
  kept.addEventListener('dispose', () => (untouched = false));
  const version = kept.version;
  await flies();
  assert.equal(kept.image, other);
  assert.deepEqual([other.width, other.height], [LIVERY.width, LIVERY.height]);
  assert.equal(kept.version, version);
  assert.ok(untouched);
});

test('an owner\'s picture bigger than LIVERY.picture is drawn down to it, keeping its shape, and one smaller is drawn as it is', async () => {
  const sizes = [
    [[2048, 1024], LIVERY.picture],
    [[4096, 2048], LIVERY.picture],
    [[3000, 1000], [1024, 341]],
    [[640, 320], [640, 320]],
  ];
  for (const [[width, height], fits] of sizes) {
    const canvas = createSketchpad();
    const texture = liveryTexture('flyte', { canvas, picture: () => Promise.resolve({ width, height }) });
    await flies();
    assert.deepEqual([canvas.width, canvas.height], fits, `${width} x ${height}`);
    const [name, , ...to] = canvas.calls.at(-1);
    assert.deepEqual([name, ...to], ['drawImage', 0, 0, ...fits]);
    // Smoothed as well as the browser can, as it is drawn: the canvas forgets how once resized.
    assert.deepEqual(canvas.calls.at(-2), ['imageSmoothingQuality', 'high']);
    texture.dispose();
  }
  // The card is never given more than about 2.8 MB for a livery, its smaller copies included.
  const [most, mostDown] = LIVERY.picture;
  assert.ok((most * mostDown * 4 * 4) / 3 <= 2.8e6);
});

test('the owner\'s picture is asked for once a visit from public/liveries/<id>.png under the site\'s root, and a missing or empty one is none', async (t) => {
  const asked = [];
  // The browser's Image, standing in: Flyte's picture loads, Sheetless's is not there, and any other
  // loads with nothing in it.
  function FakeImage() {
    Object.defineProperty(this, 'src', {
      set: (url) => {
        asked.push(url);
        this.naturalWidth = url.includes('flyte') ? 2048 : 0;
        setTimeout(() => (url.includes('sheetless') ? this.onerror() : this.onload()), 0);
      },
    });
  }
  const had = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  globalThis.Image = FakeImage;
  t.after(() => (had ? Object.defineProperty(globalThis, 'Image', had) : delete globalThis.Image));
  const flyte = liveryPicture('flyte', '/base/');
  assert.equal(liveryPicture('flyte', '/base/'), flyte, 'asked once');
  assert.ok((await flyte) instanceof FakeImage);
  assert.equal(await liveryPicture('sheetless', '/base/'), null, 'a file that is not there');
  assert.equal(await liveryPicture('calibrated', '/base/'), null, 'a file with nothing in it');
  assert.deepEqual(asked, ['/base/liveries/flyte.png', '/base/liveries/sheetless.png', '/base/liveries/calibrated.png']);
});
