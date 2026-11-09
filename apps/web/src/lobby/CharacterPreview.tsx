import { useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Character } from '../game/character/Character';
import type { MotionState } from '../game/character/Chibi';

/** Spinning preview of your 3D character in the lobby (updates with the chosen color). */
export function CharacterPreview({ color }: { color: string }) {
  return (
    <div className="lobby-preview">
      <Canvas camera={{ position: [0, 1.3, 3.4], fov: 35 }} dpr={[1, 2]}>
        <hemisphereLight args={['#ffffff', '#334155', 1.3]} />
        <directionalLight position={[3, 5, 4]} intensity={1.2} />
        <Spin color={color} />
      </Canvas>
    </div>
  );
}

function Spin({ color }: { color: string }) {
  const g = useRef<THREE.Group>(null);
  const motion = useRef<MotionState>({ gait: 0, airborne: false, cheer: 1.5 });
  useFrame(({ camera }, delta) => {
    if (g.current) g.current.rotation.y += delta * 0.8;
    camera.lookAt(0, 0.85, 0);
  });
  return (
    <group ref={g} position={[0, 0, 0]}>
      <Character color={color} motion={motion} backpack />
    </group>
  );
}
