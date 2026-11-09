import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Circle } from '@meetspace/venue';
import { QUEST } from '../theme';

const HEIGHT = 16;

/**
 * The battle-royale safe zone: a translucent red wall on the circle's edge and a ring on the
 * ground. It eases to the new size when the organizer shrinks the circle.
 */
export function StormWall({ circle }: { circle: Circle }) {
  const group = useRef<THREE.Group>(null);
  const radius = useRef(circle.radius);
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const k = reduceMotion ? 1 : 1 - Math.exp(-delta * 1.5);
    radius.current += (circle.radius - radius.current) * k;
    g.position.x += (circle.center[0] - g.position.x) * k;
    g.position.z += (circle.center[1] - g.position.z) * k;
    g.scale.set(radius.current, 1, radius.current);
  });

  return (
    <group ref={group} position={[circle.center[0], 0, circle.center[1]]} scale={[circle.radius, 1, circle.radius]}>
      <mesh position={[0, HEIGHT / 2, 0]}>
        <cylinderGeometry args={[1, 1, HEIGHT, 96, 1, true]} />
        <meshBasicMaterial color={QUEST.storm} transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <ringGeometry args={[0.985, 1, 128]} />
        <meshBasicMaterial color={QUEST.storm} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}
