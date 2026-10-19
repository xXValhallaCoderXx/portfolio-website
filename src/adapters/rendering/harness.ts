import type { CanvasSurface } from './rendering.types.ts';
interface FabricMask { width: number; height: number; data: Uint8ClampedArray }
// The pilot's cocoon shares a texture with skin, clothes and helmet. A fixed UV mask marks only
// the original blue-grey fabric: red is body cloth, green is trim, black is left exactly alone.
// The source texture and material remain owned by the model loader, including on other gliders.
import { CanvasTexture, type Texture } from 'three';

export const HARNESSES = Object.freeze({
  raven: Object.freeze({ body: '#0a0a11', trim: '#8c64ed', look: 'black fabric with violet trim' }),
  calibrated: Object.freeze({ body: '#141922', trim: '#f04848', look: 'graphite fabric with plate-red trim' }),
  sheetless: Object.freeze({ body: '#0b1b2d', trim: '#5ee6ff', look: 'ink-blue fabric with cyan trim' }),
  flyte: Object.freeze({ body: '#173c32', trim: '#e2c78d', look: 'slate-green fabric with sand trim' }),
  hird: Object.freeze({ body: '#0f1624', trim: '#e2b04a', look: 'night-blue fabric with gold trim' }),
  valkyrie: Object.freeze({ body: '#e9edf0', trim: '#e1b34d', look: 'white fabric with gold trim' }),
});

const rgb = (hex: string) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));

/** Recolours RGBA pixels in place, preserving alpha, shading and every pixel outside the mask. */
export function recolourHarness(pixels: Uint8ClampedArray, mask: Uint8ClampedArray, id: string) {
  const theme = HARNESSES[id as keyof typeof HARNESSES];
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
let maskRequest: Promise<FabricMask>|null = null;
function readMask(base: string) {
  if (!maskRequest) {
    maskRequest = new Promise<FabricMask>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const ctx = canvas.getContext('2d')!;
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
export async function harnessTexture(id: string, source: Texture | null, { canvas = document.createElement('canvas'), base = '/', mask = readMask }: { canvas?: CanvasSurface; base?: string; mask?: (base: string) => Promise<{ width: number; height: number; data?: Uint8ClampedArray }> } = {}) {
  if (!HARNESSES[id as keyof typeof HARNESSES]) throw new Error(`There is no harness theme called ${id}.`);
  if (!source?.image) throw new Error('The pilot texture is not available.');
  const fabric = await mask(base);
  const image = source.image as CanvasImageSource & { width: number; height: number };
  canvas.width = image.width;
  canvas.height = image.height;
  if (fabric.width !== canvas.width || fabric.height !== canvas.height) throw new Error('The cocoon mask does not match the pilot texture.');
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  recolourHarness(pixels.data, fabric.data!, id);
  ctx.putImageData(pixels, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.name = `harness-${id}`;
    texture.colorSpace = source.colorSpace;
  texture.flipY = source.flipY;
  texture.wrapS = source.wrapS;
  texture.wrapT = source.wrapT;
  texture.magFilter = source.magFilter;
  texture.minFilter = source.minFilter;
  texture.anisotropy = source.anisotropy;
  texture.channel = source.channel;
  texture.offset.copy(source.offset);
  texture.repeat.copy(source.repeat);
  texture.center.copy(source.center);
  texture.rotation = source.rotation;
  return texture;
}
