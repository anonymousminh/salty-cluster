import { useMemo } from 'react';
import * as THREE from 'three';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { WORLD } from '@meetspace/venue';
import { WORLD_COLORS, ZONE_TINT } from '../theme';

/** Grass, gravel paths and zone floors. One big fixed collider for the ground. */
export function Ground() {
  const [w, d] = WORLD.size;
  const grassTex = useMemo(() => checkerTexture(WORLD_COLORS.grass, WORLD_COLORS.grassDark), []);
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[w / 2 + 20, 0.5, d / 2 + 20]} position={[0, -0.5, 0]} />
      </RigidBody>
      {/* grass */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w + 40, d + 40]} />
        <meshStandardMaterial map={grassTex} roughness={1} />
      </mesh>
      {/* zone floors */}
      {WORLD.zones.map((z) => (
        <mesh key={z.id} rotation={[-Math.PI / 2, 0, 0]} position={[z.center[0], 0.01, z.center[1]]}>
          <planeGeometry args={z.size} />
          <meshStandardMaterial color={ZONE_TINT[z.kind]} transparent opacity={z.kind === 'garden' ? 0.25 : 0.45} roughness={1} />
        </mesh>
      ))}
      {/* paths */}
      {WORLD.paths.map((p, i) => {
        const dx = p.to[0] - p.from[0];
        const dz = p.to[1] - p.from[1];
        const len = Math.hypot(dx, dz);
        return (
          <group key={i} position={[(p.from[0] + p.to[0]) / 2, 0.02 + i * 0.002, (p.from[1] + p.to[1]) / 2]} rotation={[0, -Math.atan2(dz, dx), 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[len + p.width, p.width + 0.5]} />
              <meshStandardMaterial color={WORLD_COLORS.pathEdge} roughness={1} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
              <planeGeometry args={[len + p.width - 0.5, p.width]} />
              <meshStandardMaterial color={WORLD_COLORS.path} roughness={1} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function checkerTexture(a: string, b: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = b;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillRect(32, 32, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(34, 34);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
