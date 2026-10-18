// The pilot's cocoon shares a texture with skin, clothes and helmet. A fixed UV mask marks only
// the original blue-grey fabric: red is body cloth, green is trim, black is left exactly alone.
// The source texture and material remain owned by the model loader, including on other gliders.
import { CanvasTexture } from 'three';

export const HARNESSES = Object.freeze({
  raven: Object.freeze({ body: '#0a0a11', trim: '#8c64ed', look: 'black fabric with violet trim' }),
  calibrated: Object.freeze({ body: '#141922', trim: '#f04848', look: 'graphite fabric with plate-red trim' }),
  sheetless: Object.freeze({ body: '#0b1b2d', trim: '#5ee6ff', look: 'ink-blue fabric with cyan trim' }),
  flyte: Object.freeze({ body: '#173c32', trim: '#e2c78d', look: 'slate-green fabric with sand trim' }),
  hird: Object.freeze({ body: '#0f1624', trim: '#e2b04a', look: 'night-blue fabric with gold trim' }),
  valkyrie: Object.freeze({ body: '#e9edf0', trim: '#e1b34d', look: 'white fabric with gold trim' }),
});

const rgb = (hex) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));

/** Recolours RGBA pixels in place, preserving alpha, shading and every pixel outside the mask. */
export function recolourHarness(pixels, mask, id) {
  const theme = HARNESSES[id];
  if (!theme) throw new Error(`There is no harness theme called ${id}.`);
  if (pixels.length !== mask.length || pixels.length % 4) throw new Error('Harness mask and texture must have matching RGBA pixels.');
  const body = rgb(theme.body);
  const trim = rgb(theme.trim);
  for (let i = 0; i < pixels.length; i += 4) {
    const cloth = mask[i] / 255;
    const edge = mask[i + 1] / 255;
    const amount = Math.min(1, cloth + edge);
    if (!amount) continue;
    const shade = Math.min(1.2, 0.5 + (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) / 296);
    for (let channel = 0; channel < 3; channel++) {
      const colour = (body[channel] * cloth + trim[channel] * edge) / (cloth + edge);
      pixels[i + channel] = pixels[i + channel] * (1 - amount) + colour * shade * amount;
    }
  }
  return pixels;
}

// Shared immutable mask pixels; a failed request is forgotten so wearing a harness can retry.
let maskRequest = null;
function readMask(base) {
  if (!maskRequest) {
    maskRequest = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(image, 0, 0);
          resolve({ width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data });
        } catch (error) { reject(error); }
      };
      image.onerror = () => reject(new Error('The cocoon fabric mask did not load.'));
      image.src = `${base}models/pilot-cocoon-mask.png`;
    }).catch((error) => {
      maskRequest = null;
      throw error;
    });
  }
  return maskRequest;
}

/** A caller-owned texture. The original map's UV orientation, colour space and filtering survive. */
export async function harnessTexture(id, source, { canvas = document.createElement('canvas'), base = '/', mask = readMask } = {}) {
  if (!HARNESSES[id]) throw new Error(`There is no harness theme called ${id}.`);
  if (!source?.image) throw new Error('The pilot texture is not available.');
  const fabric = await mask(base);
  const image = source.image;
  canvas.width = image.width;
  canvas.height = image.height;
  if (fabric.width !== canvas.width || fabric.height !== canvas.height) throw new Error('The cocoon mask does not match the pilot texture.');
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  recolourHarness(pixels.data, fabric.data, id);
  ctx.putImageData(pixels, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.name = `harness-${id}`;
  for (const property of ['colorSpace', 'flipY', 'wrapS', 'wrapT', 'magFilter', 'minFilter', 'anisotropy', 'channel']) texture[property] = source[property];
  texture.offset.copy(source.offset);
  texture.repeat.copy(source.repeat);
  texture.center.copy(source.center);
  texture.rotation = source.rotation;
  return texture;
}
