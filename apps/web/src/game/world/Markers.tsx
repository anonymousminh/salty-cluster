import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { CylinderCollider, RigidBody } from '@react-three/rapier';
import type { Availability, Spot, Vec2 } from '@meetspace/venue';
import { useGame } from '../store';
import { beamGradient, labelTexture } from '../textures';
import { AVAILABILITY_COLOR, QUEST, WORLD_COLORS } from '../theme';

/** Meetup point: a round table (or lounge) with chairs and an availability ring. */
export function MeetupPoint({ spot, availability, targeted }: { spot: Spot; availability?: Availability; targeted: boolean }) {
  const ring = useRef<THREE.Mesh>(null);
  const color = targeted ? QUEST.meetup : AVAILABILITY_COLOR[availability ?? 'unknown'];
  const label = useMemo(() => labelTexture(spot.name, 'rgba(15,23,42,0.75)', '#ffffff', 36), [spot.name]);
  useFrame(({ clock }) => {
    if (ring.current && targeted) ring.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4) * 0.08);
  });
  const lounge = spot.kind === 'lounge' || spot.kind === 'bench';
  return (
    <group position={[spot.anchor[0], 0, spot.anchor[1]]}>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[0.4, 0.55]} position={[0, 0.4, 0]} />
      </RigidBody>
      {lounge ? (
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[2.2, 0.6, 0.9]} />
          <meshStandardMaterial color="#a78bfa" />
        </mesh>
      ) : (
        <>
          <mesh position={[0, 0.72, 0]}>
            <cylinderGeometry args={[0.6, 0.6, 0.06, 24]} />
            <meshStandardMaterial color={spot.kind === 'cafe' ? '#fef3c7' : WORLD_COLORS.wood} />
          </mesh>
          <mesh position={[0, 0.36, 0]}>
            <cylinderGeometry args={[0.06, 0.1, 0.72, 8]} />
            <meshStandardMaterial color="#475569" />
          </mesh>
          {[0, Math.PI].map((a) => (
            <mesh key={a} position={[Math.cos(a) * 1.0, 0.25, Math.sin(a) * 1.0]}>
              <boxGeometry args={[0.45, 0.5, 0.45]} />
              <meshStandardMaterial color="#e2e8f0" />
            </mesh>
          ))}
        </>
      )}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[1.6, 1.85, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} depthWrite={false} />
      </mesh>
      <sprite position={[0, 2.0, 0]} scale={[0.34 * label.aspect, 0.34, 1]}>
        <spriteMaterial map={label.tex} transparent depthWrite={false} />
      </sprite>
    </group>
  );
}

/** Tall light pillar marking a waypoint or bounty, visible across the park. */
export function Beacon({ at, color = QUEST.waypoint, height = 26, radius = 0.6, opacity = 0.8 }: { at: Vec2; color?: string; height?: number; radius?: number; opacity?: number }) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime % 1.6;
    if (ring.current) {
      ring.current.scale.setScalar(0.6 + t * 1.6);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t / 1.6);
    }
  });
  return (
    <group position={[at[0], 0, at[1]]}>
      <mesh position={[0, height / 2, 0]} renderOrder={5}>
        <cylinderGeometry args={[radius, radius, height, 24, 1, true]} />
        <meshBasicMaterial color={color} alphaMap={beamGradient()} opacity={opacity * 0.75} transparent depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <ringGeometry args={[1.0, 1.25, 48]} />
        <meshBasicMaterial color={color} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Chevrons on the ground just ahead of the player, pointing at the waypoint. */
export function GuideArrow({ target, color = QUEST.waypoint }: { target: Vec2 | null; color?: string }) {
  const group = useRef<THREE.Group>(null);
  const chevrons = useRef<THREE.Mesh[]>([]);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const pos = useGame.getState().playerPos;
    if (!target) {
      g.visible = false;
      return;
    }
    const dx = target[0] - pos[0];
    const dz = target[1] - pos[1];
    const d = Math.hypot(dx, dz);
    g.visible = d > 3;
    g.position.set(pos[0], 0.08, pos[1]);
    g.rotation.y = -Math.atan2(dz, dx);
    chevrons.current.forEach((m, i) => {
      const k = (clock.elapsedTime * 1.5 + i / 3) % 1;
      m.position.x = 1.2 + k * 2.4;
      (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * Math.sin(k * Math.PI);
    });
  });
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.25, -0.45);
    s.lineTo(0.25, 0);
    s.lineTo(-0.25, 0.45);
    s.lineTo(-0.05, 0);
    s.closePath();
    return s;
  }, []);
  return (
    <group ref={group}>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(m) => {
            if (m) chevrons.current[i] = m;
          }}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <shapeGeometry args={[shape]} />
          <meshBasicMaterial color={color} transparent depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}
