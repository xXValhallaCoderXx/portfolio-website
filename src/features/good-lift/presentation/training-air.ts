import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Group, Points, PointsMaterial, type Scene } from 'three';
import type { AirSample, ThermalSource, Vector3 } from '../../../domains/flight/models.ts';

interface TrainingAirPort {
  scene: Scene; position: Vector3;
  sources(): readonly ThermalSource[]; clock(): number;
  sampleAir(position: Vector3, output: AirSample): AirSample;
}

/** Draw the lesson's actual rising air. Reads its clock and sources without advancing either. */
export function createTrainingAir(port: TrainingAirPort) {
  const group = new Group(); group.visible = false; port.scene.add(group);
  const count = 288, positions = new Float32Array(count * 3), colors = new Float32Array(count * 3);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
  const context = canvas.getContext('2d')!;
  const glow = context.createRadialGradient(16, 16, 0, 16, 16, 16);
  glow.addColorStop(0, 'white'); glow.addColorStop(.2, 'rgba(255,255,255,.9)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = glow; context.fillRect(0, 0, 32, 32);
  const texture = new CanvasTexture(canvas);
  const material = new PointsMaterial({ map: texture, size: 1.3, vertexColors: true, transparent: true,
    opacity: .8, blending: AdditiveBlending, depthWrite: false });
  const points = new Points(geometry, material); points.frustumCulled = false; group.add(points);
  const at = { x: 0, y: 0, z: 0 }, air: AirSample = {};
  return {
    draw(active: boolean) {
      const source = port.sources()[0]; group.visible = active && !!source;
      if (!group.visible || !source) return;
      const clock = port.clock();
      for (let i = 0; i < count; i++) {
        const radius = (source.r ?? 0) * .82 * Math.sqrt((i + .5) / count), angle = i * 2.3999632297;
        at.x = source.x + Math.cos(angle) * radius; at.z = source.z + Math.sin(angle) * radius; at.y = port.position.y;
        port.sampleAir(at, air);
        const lift = Math.max(0, air.thermal ?? 0), phase = ((i * .61803398875 + clock * lift / 100) % 1 + 1) % 1;
        positions.set([at.x, port.position.y - 35 + phase * 100, at.z], i * 3);
        const brightness = Math.min(1, lift / 5.5) * Math.min(1, phase * 8, (1 - phase) * 8);
        colors.set([brightness, brightness * .75, brightness * .3], i * 3);
      }
      geometry.attributes.position.needsUpdate = true; geometry.attributes.color.needsUpdate = true;
    },
    dispose() { group.removeFromParent(); geometry.dispose(); material.dispose(); texture.dispose(); },
  };
}
