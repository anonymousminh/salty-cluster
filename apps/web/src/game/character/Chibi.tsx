import { useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

/** What the body should be doing this frame. Written by the controller (player) or the bot brain. */
export interface MotionState {
  /** 0 = standing, ~1 = walking, ~2 = running. */
  gait: number;
  airborne: boolean;
  /** One-shot wave / cheer (seconds remaining). */
  cheer?: number;
}

export interface ChibiProps {
  color: string;
  motion: MutableRefObject<MotionState>;
  skin?: string;
  hair?: string;
  /** Small backpack accessory. */
  backpack?: boolean;
}

/**
 * Procedural toy-style character (no assets): rounded body, big head, swinging limbs.
 * Model space: feet at y = 0, facing +z. About 1.6 m tall.
 */
export function Chibi({ color, motion, skin = '#ffd7b5', hair = '#3b2a20', backpack = false }: ChibiProps) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const phase = useRef(Math.random() * 10);
  const shirt = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.6 }), [color]);
  const pants = useMemo(() => new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.8 }), []);
  const skinMat = useMemo(() => new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 }), [skin]);
  const hairMat = useMemo(() => new THREE.MeshStandardMaterial({ color: hair, roughness: 0.9 }), [hair]);

  useFrame((_, delta) => {
    const m = motion.current;
    const gait = Math.min(m.gait, 2.2);
    phase.current += delta * (4 + gait * 3.5);
    const s = Math.sin(phase.current);
    const swing = m.airborne ? 0.9 : Math.min(1, gait) * (0.55 + Math.max(0, gait - 1) * 0.35);
    if (legL.current && legR.current) {
      legL.current.rotation.x = m.airborne ? -0.6 : s * swing;
      legR.current.rotation.x = m.airborne ? 0.3 : -s * swing;
    }
    if (armL.current && armR.current) {
      const cheering = (m.cheer ?? 0) > 0;
      armL.current.rotation.x = m.airborne ? -2.4 : -s * swing * 0.9;
      armR.current.rotation.x = cheering ? -2.8 + Math.sin(phase.current * 3) * 0.3 : m.airborne ? -2.4 : s * swing * 0.9;
      armR.current.rotation.z = cheering ? -0.3 : 0;
      if (cheering) m.cheer = Math.max(0, (m.cheer ?? 0) - delta);
    }
    if (body.current) {
      const idle = gait < 0.05 && !m.airborne;
      body.current.position.y = idle ? Math.sin(phase.current * 0.5) * 0.015 : Math.abs(s) * 0.06 * Math.min(1, gait);
      body.current.rotation.x = Math.min(0.25, gait * 0.08); // lean into running
    }
  });

  return (
    <group ref={root}>
      {/* blob shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.42, 24]} />
        <meshBasicMaterial color="#000" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <group ref={body}>
        {/* legs (pivot at hips) */}
        <group ref={legL} position={[-0.13, 0.55, 0]}>
          <mesh position={[0, -0.25, 0]} material={pants}>
            <capsuleGeometry args={[0.1, 0.32, 4, 10]} />
          </mesh>
          <mesh position={[0, -0.5, 0.05]}>
            <boxGeometry args={[0.18, 0.1, 0.28]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
        </group>
        <group ref={legR} position={[0.13, 0.55, 0]}>
          <mesh position={[0, -0.25, 0]} material={pants}>
            <capsuleGeometry args={[0.1, 0.32, 4, 10]} />
          </mesh>
          <mesh position={[0, -0.5, 0.05]}>
            <boxGeometry args={[0.18, 0.1, 0.28]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
        </group>
        {/* torso */}
        <mesh position={[0, 0.82, 0]} material={shirt}>
          <capsuleGeometry args={[0.27, 0.3, 6, 16]} />
        </mesh>
        {backpack && (
          <mesh position={[0, 0.85, -0.28]}>
            <boxGeometry args={[0.36, 0.42, 0.18]} />
            <meshStandardMaterial color="#f59e0b" roughness={0.7} />
          </mesh>
        )}
        {/* arms (pivot at shoulders) */}
        <group ref={armL} position={[-0.36, 1.02, 0]}>
          <mesh position={[0, -0.22, 0]} material={shirt}>
            <capsuleGeometry args={[0.08, 0.28, 4, 10]} />
          </mesh>
          <mesh position={[0, -0.44, 0]} material={skinMat}>
            <sphereGeometry args={[0.08, 12, 10]} />
          </mesh>
        </group>
        <group ref={armR} position={[0.36, 1.02, 0]}>
          <mesh position={[0, -0.22, 0]} material={shirt}>
            <capsuleGeometry args={[0.08, 0.28, 4, 10]} />
          </mesh>
          <mesh position={[0, -0.44, 0]} material={skinMat}>
            <sphereGeometry args={[0.08, 12, 10]} />
          </mesh>
        </group>
        {/* head */}
        <group position={[0, 1.38, 0]}>
          <mesh material={skinMat}>
            <sphereGeometry args={[0.3, 24, 20]} />
          </mesh>
          <mesh position={[0, 0.08, -0.02]} scale={[1.06, 0.85, 1.06]} material={hairMat}>
            <sphereGeometry args={[0.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh position={[-0.1, 0.0, 0.27]}>
            <sphereGeometry args={[0.04, 10, 8]} />
            <meshBasicMaterial color="#0f172a" />
          </mesh>
          <mesh position={[0.1, 0.0, 0.27]}>
            <sphereGeometry args={[0.04, 10, 8]} />
            <meshBasicMaterial color="#0f172a" />
          </mesh>
          <mesh position={[0, -0.1, 0.27]} rotation={[0, 0, Math.PI]}>
            <torusGeometry args={[0.05, 0.012, 6, 12, Math.PI]} />
            <meshBasicMaterial color="#7c2d12" />
          </mesh>
        </group>
      </group>
    </group>
  );
}
