import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { buildTerrain } from './terrain.ts';
import { buildSky, buildPlaces, buildScatter, buildThermals, buildGlider, buildGateway } from './scenery.ts';
const NIGHT = 0x060a13;

/** The fjord's GPU resources. No simulation or persistence is owned by this adapter. */
export function createFlightScene(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(NIGHT);
  scene.fog = new THREE.FogExp2(NIGHT, 0.003);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 5000);

  scene.add(new THREE.HemisphereLight(0x5f8fd8, 0x04060b, 1.1));
  const moon = new THREE.DirectionalLight(0xa9ccff, 1.6);
  moon.position.set(-0.6, 0.8, 0.3);
  scene.add(moon);

  const terrain = buildTerrain();
  const sky = buildSky();
  const places = buildPlaces();
  const thermals = buildThermals();
  const glider = buildGlider();
  const scatter = buildScatter(() => { terrain.cones.visible = false; });
  const gateway = buildGateway();
  scene.add(terrain.group, sky.group, places.group, scatter.group, thermals.group, glider.group, gateway.group);
  const composer = new EffectComposer(
    renderer,
    new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }),
  );
  composer.addPass(new RenderPass(scene, camera));

  // The glow pass blurs the picture, so a single pixel with no valid colour (a shader dividing by
  // zero, say) gets smeared into a large black block. This pass patches such pixels from their
  // neighbours before the glow sees them.
  const patch = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform vec2 uTexel;
      varying vec2 vUv;
      // Comparisons against an invalid number are always false, so only real colours pass.
      bool valid(vec3 c) {
        return c.r >= 0.0 && c.r <= 60000.0 && c.g >= 0.0 && c.g <= 60000.0 && c.b >= 0.0 && c.b <= 60000.0;
      }
      void main() {
        vec3 colour = texture2D(tDiffuse, vUv).rgb;
        if (!valid(colour)) {
          vec4 sum = vec4(0.0);
          for (int i = 0; i < 4; i++) {
            vec2 side = i == 0 ? vec2(1.0, 0.0) : i == 1 ? vec2(-1.0, 0.0) : i == 2 ? vec2(0.0, 1.0) : vec2(0.0, -1.0);
            vec3 beside = texture2D(tDiffuse, vUv + side * uTexel).rgb;
            if (valid(beside)) sum += vec4(beside, 1.0);
          }
          colour = sum.a > 0.0 ? sum.rgb / sum.a : vec3(0.0);
        }
        gl_FragColor = vec4(colour, 1.0);
      }`,
  });
  composer.addPass(patch);
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.65, 0.6, 0.3));
  composer.addPass(new OutputPass());
  return { renderer, scene, camera, terrain, sky, places, thermals, glider, scatter, gateway, composer, patch };
}
