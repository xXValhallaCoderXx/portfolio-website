import * as THREE from 'three';

// A separate visual seed stream. No sky sample, flight clock or saved record reads this module.
export const NORDIC_SKY = Object.freeze({ centre: Object.freeze([0, 80]),
  inner: 680, clouds: 8, heroes: 3, loadAt: Object.freeze([400, 850, 1400]), fadeSeconds: 1.2 });
const TAU = Math.PI * 2;
const clamp = (x) => Math.max(0, Math.min(1, x));
const blend = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const dice = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const KINDS = ['island-alpine', 'island-ruins', 'island-split'];

export function skyBlend(altitude, out = {}) {
  out.sea = blend(450, 900, altitude);
  out.aurora = blend(900, 1500, altitude);
  out.high = blend(1500, 2000, altitude);
  return out;
}

/** Nine fixed formations, served by three reusable hero views. Every extent is outside the arena. */
export function islandFormations(seed = 1) {
  const random = dice((seed >>> 0) ^ 0x6e6f7264);
  return Array.from({ length: 9 }, (_, i) => {
    const kind = i % 3;
    const angle = i * 2.4 + (random() - 0.5) * 0.5;
    const distance = 920 + random() * 220;
    const y = [710, 1190, 1730, 2200, 2750, 3300, 3850, 4400, 4950][i];
    return { kind, id: i, x: Math.cos(angle) * distance, z: 80 + Math.sin(angle) * distance,
      y, size: 270 + random() * 75, turn: random() * TAU, from: y - 370 };
  });
}

/** buildSky's backwards-compatible update(time, context?) and explicit resource ownership. */
export function createNordicSky({ loadModel = null } = {}) {
  const group = new THREE.Group(); group.name = 'Nordic sky';
  const celestial = new THREE.Group(); celestial.name = 'celestial'; group.add(celestial);
  const scenery = new THREE.Group(); scenery.name = 'altitude scenery'; group.add(scenery); scenery.visible = false;
  const geometries = new Set(), materials = new Set();
  const geometry = (value) => { geometries.add(value); return value; };
  const material = (value) => { materials.add(value); return value; };
  let disposed = false, lastTime = null, lastSeed = null;
  let formations = islandFormations(), motionTime = 0;
  const layers = skyBlend(0);
  const random = dice(0x73746172);

  const points = new Float32Array(1400 * 3);
  for (let i = 0; i < 1400; i++) {
    const theta = random() * TAU, phi = Math.acos(random() * 0.98 + 0.02);
    points[i * 3] = 2200 * Math.sin(phi) * Math.cos(theta);
    points[i * 3 + 1] = 2200 * Math.cos(phi);
    points[i * 3 + 2] = 2200 * Math.sin(phi) * Math.sin(theta);
  }
  const starGeo = geometry(new THREE.BufferGeometry());
  starGeo.setAttribute('position', new THREE.BufferAttribute(points, 3));
  const stars = new THREE.Points(starGeo, material(new THREE.PointsMaterial({ color: 0xcfe6ff,
    size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false, fog: false })));
  stars.name = 'stars'; celestial.add(stars);

  // The disc matches the existing directional moonlight. A soft halo does not rely on bloom.
  const moon = new THREE.Mesh(geometry(new THREE.SphereGeometry(32, 24, 16)), material(new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 p; void main() { p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 p; void main() {
      vec3 n = normalize(p);
      float grain = sin(n.x * 27.0 + sin(n.y * 32.0)) * sin(n.z * 29.0 + n.x * 14.0);
      float phase = 0.55 + 0.45 * max(0.0, dot(n, normalize(vec3(-0.3, 0.6, -1.0))));
      gl_FragColor = vec4(vec3(0.55, 0.65, 0.78) * phase * (0.93 + grain * 0.07), 1.0);
      #include <colorspace_fragment>
    }`, fog: false })));
  moon.name = 'moon'; moon.position.set(-1320, 1760, 660); celestial.add(moon); moon.visible = false;
  const halo = new THREE.Mesh(geometry(new THREE.PlaneGeometry(180, 180)), material(new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 p; void main() { p = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 p; void main() { gl_FragColor = vec4(0.4, 0.55, 0.75, 0.055 * pow(max(0.0, 1.0 - length(p)), 3.0)); }',
    transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide })));
  halo.position.copy(moon.position); halo.lookAt(0, 0, 0); halo.name = 'moon halo'; celestial.add(halo); halo.visible = false;

  const aurora = material(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, strength: { value: 1 } },
    vertexShader: `uniform float uTime; varying vec2 vUv;
      void main() { vUv = uv; vec3 p = position;
        p.z += sin(p.x * 0.006 + uTime * 0.12) * 90.0 + sin(p.x * 0.017 - uTime * 0.2) * 30.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform float uTime; uniform float strength; varying vec2 vUv;
      void main() {
        float rays = 0.5 + 0.5 * sin(vUv.x * 140.0 + sin(vUv.x * 17.0 + uTime * 0.35) * 5.0);
        float curtain = smoothstep(0.0, 0.07, vUv.y) * pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.7);
        float ends = smoothstep(0.0, 0.18, vUv.x) * (1.0 - smoothstep(0.82, 1.0, vUv.x));
        float pulse = 0.75 + 0.25 * sin(uTime * 0.5 + vUv.x * 6.0);
        vec3 col = mix(vec3(0.12, 0.95, 0.72), vec3(0.22, 0.38, 1.0), smoothstep(0.0, 0.7, vUv.y));
        gl_FragColor = vec4(col, curtain * ends * (0.3 + 0.7 * rays) * pulse * 0.5 * strength);
      }`, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  const curtains = new THREE.Group(); curtains.name = 'aurora'; celestial.add(curtains);
  for (const ribbon of [
    { x: 0, y: 340, z: -950, turn: 0, width: 1500 },
    { x: -620, y: 400, z: -700, turn: 0.6, width: 1100 },
    { x: 700, y: 320, z: -500, turn: -0.9, width: 1000 },
    { x: 300, y: 380, z: 1000, turn: Math.PI + 0.3, width: 1200 },
  ]) {
    const mesh = new THREE.Mesh(geometry(new THREE.PlaneGeometry(ribbon.width, 280, 120, 1)), aurora);
    mesh.position.set(ribbon.x, ribbon.y, ribbon.z); mesh.rotation.y = ribbon.turn; curtains.add(mesh);
  }

  const seas = [];
  for (let i = 0; i < 3; i++) {
    const seaMaterial = material(new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, fade: { value: 0 } },
      vertexShader: 'varying vec3 p; void main() { p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 p; uniform float time; uniform float fade;
        void main() {
          float r = length(p.xy);
          float rim = smoothstep(680.0, 800.0, r) * (1.0 - smoothstep(1900.0, 2300.0, r));
          float waves = sin(p.x * 0.018 + sin(p.y * 0.011) + time * 0.03) * sin(p.y * 0.022 - time * 0.02);
          waves += 0.4 * sin(p.x * 0.051 + p.y * 0.037);
          vec3 col = mix(vec3(0.035, 0.065, 0.10), vec3(0.16, 0.23, 0.29), 0.6 + waves * 0.19);
          gl_FragColor = vec4(col, fade * rim * 0.8);
          #include <colorspace_fragment>
        }`, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    const mesh = new THREE.Mesh(geometry(new THREE.RingGeometry(680, 2300, 96, 2)), seaMaterial);
    mesh.name = `cloud sea ${i}`; mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, [420, 1060, 1700][i], 80);
    scenery.add(mesh); seas.push(mesh);
  }

  // Two continuous distant silhouettes, complete around the horizon, with a few snow facets.
  const mountains = [];
  for (let layer = 0; layer < 2; layer++) {
    const vertices = [], colours = [], indices = [];
    const radius = 1800 + layer * 430, random = dice(0x7065616b + layer);
    const segments = 128;
    const heights = Array.from({ length: segments }, () => 590 + layer * 100 + random() * (layer ? 660 : 440));
    for (let i = 0; i <= segments; i++) {
      const angle = i / segments * TAU;
      const y = heights[i % segments];
      for (const height of [y, 140]) {
        vertices.push(Math.cos(angle) * radius, height, 80 + Math.sin(angle) * radius);
        const c = new THREE.Color(height === y && y > 900 ? 0x293d51 : layer ? 0x18283c : 0x1e3447);
        colours.push(c.r, c.g, c.b);
      }
      if (i < segments) { const p = i * 2; indices.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); }
    }
    const geo = geometry(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3)); geo.setIndex(indices);
    const mesh = new THREE.Mesh(geo, material(new THREE.MeshBasicMaterial({ vertexColors: true,
      transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false })));
    mesh.name = `mountains ${layer}`; scenery.add(mesh); mountains.push(mesh);
  }

  // Material copies belong to this view; models' shared geometry and embedded maps stay cached.
  function fadeModel(model, tint) {
    const owned = new Map(), fades = [];
    model.traverse((part) => {
      if (!part.isMesh) return;
      const original = part.material;
      if (!owned.has(original)) {
        const copy = material(original.clone()); copy.fog = false;
        copy.color.multiply(new THREE.Color(tint));
        copy.emissive.set(0x92b1cd); copy.emissiveIntensity = 0.32;
        const fade = { value: 0 }; fades.push(fade);
        copy.onBeforeCompile = (shader) => {
          shader.uniforms.skyFade = fade;
          shader.fragmentShader = 'uniform float skyFade;\n' + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>',
            `float screenNoise = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
             if (screenNoise > skyFade) discard;
             #include <dithering_fragment>`);
        };
        copy.customProgramCacheKey = () => 'nordic-sky-fade-v1';
        owned.set(original, copy);
      }
      part.material = owned.get(original); part.castShadow = part.receiveShadow = false;
    });
    return fades;
  }
  const heroes = KINDS.map((name) => ({ name, status: 'idle', model: null, fades: [], opacity: 0, id: -1 }));
  const banks = [];
  let cloudStatus = 'idle';
  const pending = [];
  function requestHero(view) {
    if (!loadModel || disposed || view.status !== 'idle') return;
    view.status = 'loading';
    const promise = Promise.resolve().then(() => loadModel(view.name, 1, 0.25)).then((model) => {
      if (disposed) return;
      view.model = model; model.name = view.name; model.visible = false;
      view.fades = fadeModel(model, 0x809aaf); scenery.add(model); view.status = 'ready';
    }).catch(() => { view.status = 'failed'; });
    pending.push(promise);
  }
  function requestClouds() {
    if (!loadModel || disposed || cloudStatus !== 'idle') return;
    cloudStatus = 'loading';
    pending.push(Promise.resolve().then(() => loadModel('clouds', 1, 0.2)).then((source) => {
      if (disposed) return;
      for (let i = 0; i < NORDIC_SKY.clouds; i++) {
        const model = source.clone(true); model.name = `decorative clouds ${i}`; model.visible = false;
        const fades = fadeModel(model, 0x8199b0);
        const angle = i / NORDIC_SKY.clouds * TAU;
        model.position.set(Math.cos(angle) * 1120, i % 2 ? 1440 : 480, 80 + Math.sin(angle) * 1120);
        model.rotation.y = angle; model.scale.set(260, 130, 260);
        scenery.add(model); banks.push({ model, fades, opacity: 0 });
      }
      cloudStatus = 'ready';
    }).catch(() => { cloudStatus = 'failed'; }));
  }

  function update(time, context) {
    if (disposed) return;
    // A legacy caller sees the original stars and four curtains at their original positions.
    if (!context) {
      celestial.position.set(0, 0, 0); curtains.position.y = 0;
      stars.geometry.setDrawRange(0, 1400);
      for (const ribbon of curtains.children) ribbon.visible = true;
      aurora.uniforms.uTime.value = time; aurora.uniforms.strength.value = 1;
      scenery.visible = moon.visible = halo.visible = false; lastTime = null; return;
    }
    const active = context.mode === 'cloudbase';
    const altitude = context.altitude ?? context.camera?.position?.y ?? 0;
    if (lastTime != null && time < lastTime) {
      for (const hero of heroes) hero.opacity = 0;
      for (const bank of banks) bank.opacity = 0;
      motionTime = 0;
    }
    const clockDt = lastTime == null ? 0 : Math.max(0, Math.min(0.1, time - lastTime)); lastTime = time;
    // Async models may dissolve into a paused view; environmental animation follows the run clock.
    const dt = Math.max(0, Math.min(0.1, context.dt ?? clockDt));
    if (context.camera) celestial.position.copy(context.camera.position ?? context.camera);
    skyBlend(altitude, layers);
    if (!context.reducedMotion) motionTime += clockDt;
    aurora.uniforms.uTime.value = context.reducedMotion ? 0 : motionTime;
    aurora.uniforms.strength.value = active ? 0.65 + layers.aurora * 0.6 : 1;
    curtains.position.y = active ? layers.aurora * 350 : 0;
    scenery.visible = active; moon.visible = halo.visible = active;
    stars.geometry.setDrawRange(0, context.lowDetail ? 800 : 1400);
    curtains.children.forEach((ribbon, i) => { ribbon.visible = !context.lowDetail || i % 2 === 0; });
    if (!active) {
      for (const hero of heroes) { hero.opacity = 0; if (hero.model) hero.model.visible = false; }
      for (const bank of banks) { bank.opacity = 0; bank.model.visible = false; }
      return;
    }
    const seed = context.seed ?? 1;
    if (lastSeed !== seed) {
      formations = islandFormations(seed); lastSeed = seed;
      for (const hero of heroes) { hero.id = -1; hero.opacity = 0; }
    }
    const fog = typeof context.fog === 'number' ? context.fog : context.fog?.height ?? -Infinity;
    for (let i = 0; i < seas.length; i++) {
      const sea = seas[i], from = [450, 1080, 1720][i];
      const opacity = blend(from, from + 360, altitude) * (1 - blend(sea.position.y - 80, sea.position.y + 40, fog));
      sea.visible = opacity > 0.01 && (!context.lowDetail || i === 0);
      sea.material.uniforms.fade.value = opacity; sea.material.uniforms.time.value = context.reducedMotion ? 0 : motionTime;
    }
    for (const mountain of mountains) {
      mountain.material.opacity = layers.sea * (1 - blend(1000, 1500, fog));
      mountain.visible = mountain.material.opacity > 0.01;
    }
    if (altitude >= 400) requestClouds();
    for (let kind = 0; kind < heroes.length; kind++) {
      const hero = heroes[kind];
      if (altitude >= NORDIC_SKY.loadAt[kind]) requestHero(hero);
      if (!hero.model) continue;
      let candidate = null, best = Infinity;
      for (const formation of formations) {
        if (formation.kind !== kind) continue;
        const gap = Math.abs(altitude - (formation.y + formation.size * 0.45));
        if (gap < best) { candidate = formation; best = gap; }
      }
      const visible = blend(candidate.from, candidate.from + 240, altitude) *
        (1 - blend(candidate.y + 650, candidate.y + 950, altitude)) *
        (1 - blend(candidate.y - 80, candidate.y + candidate.size, fog));
      if (hero.id !== candidate.id) { hero.id = candidate.id; hero.opacity = 0; }
      const target = context.lowDetail && kind === 2 ? 0 : visible;
      hero.opacity += Math.sign(target - hero.opacity) * Math.min(Math.abs(target - hero.opacity), dt / NORDIC_SKY.fadeSeconds);
      hero.model.position.set(candidate.x, candidate.y, candidate.z);
      hero.model.rotation.y = candidate.turn; hero.model.scale.setScalar(candidate.size);
      hero.model.visible = hero.opacity > 0.01;
      for (const fade of hero.fades) fade.value = hero.opacity;
    }
    for (let i = 0; i < banks.length; i++) {
      const bank = banks[i], y = bank.model.position.y;
      const target = (context.lowDetail && i % 4 !== 0 ? 0 : layers.sea) *
        (1 - blend(550, 900, Math.abs(altitude - y))) * (1 - blend(y - 80, y + 100, fog));
      bank.opacity += Math.sign(target - bank.opacity) * Math.min(Math.abs(target - bank.opacity), dt / NORDIC_SKY.fadeSeconds);
      bank.model.visible = bank.opacity > 0.01;
      for (const fade of bank.fades) fade.value = bank.opacity;
    }
  }
  function dispose() {
    if (disposed) return; disposed = true;
    group.removeFromParent();
    for (const item of geometries) item.dispose();
    for (const item of materials) item.dispose();
    group.clear();
  }
  return { group, update, dispose, get ready() { return Promise.all(pending); },
    get state() { return { layers: { ...layers }, seed: lastSeed, clouds: cloudStatus,
      islands: heroes.map(({ name, status, opacity, id }) => ({ name, status, opacity, id })),
      visibleHeroes: heroes.filter((hero) => hero.model?.visible).length,
      visibleClouds: banks.filter((bank) => bank.model.visible).length }; } };
}
