import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { CHECKIN_RADIUS, KIOSK_SIZE, boothFront, type Booth as BoothData, type BoothSlot } from '@meetspace/venue';
import { badgeTexture, initials, labelTexture } from '../textures';
import { QUEST } from '../theme';

export type BoothState = 'open' | 'visited' | 'bounty';

interface Props {
  booth: BoothData;
  slot: BoothSlot;
  state: BoothState;
  xp: number;
  /** Player is inside the check-in radius. */
  near: boolean;
  /** Current waypoint. */
  targeted: boolean;
}

/**
 * A sponsor "stop": a kiosk with a canopy and a spinning company token floating above it.
 * The token is blue when you can check in, gold for bounties, grey once visited.
 * A ring on the ground marks where to stand to talk.
 */
export function Booth({ booth, slot, state, xp, near, targeted }: Props) {
  const token = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const rot = ((90 - slot.facingDeg) * Math.PI) / 180;
  const visited = state === 'visited';
  const brand = useMemo(() => new THREE.Color(visited ? '#cbd5e1' : booth.color), [visited, booth.color]);
  const tokenColor = visited ? QUEST.visited : state === 'bounty' ? QUEST.bounty : '#38bdf8';
  const badge = useMemo(
    () => (visited ? badgeTexture('✓', '#64748b', '#e2e8f0') : badgeTexture(initials(booth.company), booth.color, '#ffffff')),
    [visited, booth.company, booth.color],
  );
  const title = useMemo(() => labelTexture(booth.company, 'rgba(15,23,42,0.85)', '#ffffff', 40), [booth.company]);
  const xpTag = useMemo(() => labelTexture(visited ? 'Visited' : `+${xp} XP`, state === 'bounty' ? '#f59e0b' : '#0ea5e9', '#ffffff', 40), [visited, xp, state]);
  const front = boothFront(slot);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    if (token.current) {
      token.current.rotation.y += delta * (near ? 3 : visited ? 0.4 : 1.2);
      token.current.position.y = 4.1 + Math.sin(t * 2 + slot.anchor[0]) * 0.15;
    }
    if (ring.current) {
      const s = near ? 1 + Math.sin(t * 5) * 0.06 : 1;
      ring.current.scale.set(s, s, s);
    }
  });

  return (
    <group>
      {/* kiosk (rotated to face the walkway) */}
      <group position={[slot.anchor[0], 0, slot.anchor[1]]} rotation={[0, rot, 0]}>
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[KIOSK_SIZE[0] / 2, KIOSK_SIZE[1] / 2, KIOSK_SIZE[2] / 2]} position={[0, KIOSK_SIZE[1] / 2, 0]} />
        </RigidBody>
        {/* counter */}
        <mesh position={[0, 0.55, 0.45]}>
          <boxGeometry args={[2.6, 1.1, 0.8]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.8, 0.86]}>
          <boxGeometry args={[2.6, 0.35, 0.04]} />
          <meshStandardMaterial color={brand} emissive={brand} emissiveIntensity={0.25} />
        </mesh>
        {/* back wall + canopy */}
        <mesh position={[0, 1.4, -0.65]}>
          <boxGeometry args={[2.8, 2.8, 0.15]} />
          <meshStandardMaterial color={brand} />
        </mesh>
        <mesh position={[0, 2.85, -0.05]} rotation={[0.18, 0, 0]}>
          <boxGeometry args={[3.0, 0.12, 1.6]} />
          <meshStandardMaterial color={brand} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 1.35, 1.4, 0.65]}>
            <cylinderGeometry args={[0.05, 0.05, 2.8, 6]} />
            <meshStandardMaterial color="#e2e8f0" />
          </mesh>
        ))}
        <mesh position={[0, 1.7, -0.56]}>
          <planeGeometry args={[1.2, 1.2]} />
          <meshBasicMaterial map={badge} transparent toneMapped={false} />
        </mesh>
      </group>

      {/* floating spinning token */}
      <group ref={token} position={[slot.anchor[0], 4.1, slot.anchor[1]]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.55, 0.55, 0.12, 6]} />
          <meshStandardMaterial color={tokenColor} emissive={tokenColor} emissiveIntensity={0.5} metalness={0.2} roughness={0.3} />
        </mesh>
        {[1, -1].map((side) => (
          <mesh key={side} position={[0, 0, side * 0.065]} rotation={[0, side > 0 ? 0 : Math.PI, 0]}>
            <circleGeometry args={[0.42, 24]} />
            <meshBasicMaterial map={badge} transparent toneMapped={false} />
          </mesh>
        ))}
      </group>
      <sprite position={[slot.anchor[0], 5.15, slot.anchor[1]]} scale={[0.42 * title.aspect, 0.42, 1]}>
        <spriteMaterial map={title.tex} transparent depthWrite={false} />
      </sprite>
      <sprite position={[slot.anchor[0], 4.7, slot.anchor[1]]} scale={[0.32 * xpTag.aspect, 0.32, 1]}>
        <spriteMaterial map={xpTag.tex} transparent depthWrite={false} />
      </sprite>

      {/* where to stand */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[front[0], 0.04, front[1]]}>
        <ringGeometry args={[CHECKIN_RADIUS * 0.28, CHECKIN_RADIUS * 0.34, 40]} />
        <meshBasicMaterial color={near || targeted ? QUEST.waypoint : tokenColor} transparent opacity={near ? 0.9 : 0.45} depthWrite={false} />
      </mesh>
    </group>
  );
}
