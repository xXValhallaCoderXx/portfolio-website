import test from 'node:test';
import assert from 'node:assert/strict';
import { DataTexture, SRGBColorSpace } from 'three';
import { HARNESSES, harnessTexture, recolourHarness } from './harness.js';
import { KIT_THEMES } from './wing-kit.js';
import { createSketchpad } from './test-canvas.js';

test('every earned wing theme has a matching cocoon palette and a readable description', () => {
  assert.deepEqual(Object.keys(HARNESSES), KIT_THEMES.slice(1));
  for (const theme of Object.values(HARNESSES)) {
    assert.match(theme.body, /^#[0-9a-f]{6}$/);
    assert.match(theme.trim, /^#[0-9a-f]{6}$/);
    assert.notEqual(theme.body, theme.trim);
    assert.ok(theme.look);
  }
});

test('only masked cloth changes: skin, clothing, alpha and the source mask remain exact', () => {
  const pixels = new Uint8ClampedArray([210, 175, 130, 255, 130, 150, 160, 244, 130, 150, 160, 255, 40, 42, 45, 128]);
  const mask = new Uint8ClampedArray([0, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 255]);
  const before = pixels.slice();
  const originalMask = mask.slice();
  for (const id of Object.keys(HARNESSES)) {
    const painted = recolourHarness(before.slice(), mask, id);
    assert.deepEqual(painted.slice(0, 4), before.slice(0, 4), `${id}: skin`);
    assert.deepEqual(painted.slice(12), before.slice(12), `${id}: clothes`);
    assert.equal(painted[7], 244, `${id}: fabric alpha`);
    assert.notDeepEqual(painted.slice(4, 7), before.slice(4, 7));
    assert.notDeepEqual(painted.slice(4, 7), painted.slice(8, 11), `${id}: distinct trim`);
  }
  assert.deepEqual(mask, originalMask);
  assert.throws(() => recolourHarness(pixels, mask, 'unknown'), /no harness theme/);
  assert.throws(() => recolourHarness(pixels, mask.slice(0, 4), 'raven'), /matching RGBA/);
});

test('fabric keeps its shading and seams, and partially masked pixels blend without changing alpha', () => {
  const pixels = new Uint8ClampedArray([40, 50, 60, 255, 150, 170, 180, 255, 100, 120, 130, 123]);
  const mask = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255, 128, 0, 0, 255]);
  const result = recolourHarness(pixels, mask, 'valkyrie');
  for (let channel = 0; channel < 3; channel++) assert.ok(result[channel] < result[4 + channel], 'a shaded seam stays darker');
  assert.ok(result[8] > 100 && result[8] < result[4], 'the mask edge blends');
  assert.equal(result[11], 123);
});

test('a cocoon texture preserves the model map orientation, UV transform, filtering and colour space without editing it', async () => {
  const source = new DataTexture(new Uint8Array([130, 150, 160, 255]), 1, 1);
  source.colorSpace = SRGBColorSpace;
  source.flipY = false;
  source.offset.set(0.1, 0.2);
  source.repeat.set(0.8, 0.9);
  source.center.set(0.5, 0.5);
  source.rotation = 0.2;
  source.anisotropy = 4;
  const before = source.image.data.slice();
  const canvas = createSketchpad(1, 1);
  canvas.getContext('2d').getImageData = () => ({ data: new Uint8ClampedArray(before), width: 1, height: 1 });
  const mask = async () => ({ width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255]) });
  const texture = await harnessTexture('flyte', source, { canvas, mask });
  assert.equal(texture.name, 'harness-flyte');
  assert.equal(texture.image, canvas);
  assert.notEqual(texture, source);
  for (const property of ['colorSpace', 'flipY', 'wrapS', 'wrapT', 'magFilter', 'minFilter', 'anisotropy', 'channel', 'rotation']) assert.equal(texture[property], source[property], property);
  assert.ok(texture.offset.equals(source.offset) && texture.repeat.equals(source.repeat) && texture.center.equals(source.center));
  assert.deepEqual(source.image.data, before);
  assert.equal(canvas.calls.filter(([name]) => name === 'putImageData').length, 1);
  await assert.rejects(harnessTexture('raven', source, { canvas, mask: async () => ({ width: 2, height: 1 }) }), /does not match/);
  texture.dispose();
  source.dispose();
});
