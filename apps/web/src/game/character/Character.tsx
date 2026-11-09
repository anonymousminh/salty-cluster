import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Chibi, type MotionState } from './Chibi';

/**
 * Drop a rigged, animated glTF character at this path to replace the procedural one,
 * e.g. a KayKit Adventurers character (CC0): https://kaylousberg.itch.io/kaykit-adventurers
 * Expected: feet at y = 0, facing +z, height ~1.6–2 units (scaled to CHARACTER_HEIGHT).
 */
export const CHARACTER_GLB = '/characters/player.glb';
const CHARACTER_HEIGHT = 1.65;

/** Clip-name candidates (case-insensitive substring match), first hit wins. KayKit + Mixamo-style names. */
const CLIPS = {
  idle: ['idle'],
  walk: ['walking_a', 'walk'],
  run: ['running_a', 'run', 'sprint'],
  jump: ['jump_idle', 'jump', 'fall'],
  cheer: ['cheer', 'wave', 'interact'],
};

let probe: Promise<boolean> | null = null;
/** Does the optional character file exist? (Vite serves index.html for unknown paths, so check the type.) */
function characterAvailable(): Promise<boolean> {
  probe ??= fetch(CHARACTER_GLB, { method: 'HEAD' })
    .then((r) => r.ok && !(r.headers.get('content-type') ?? '').includes('text/html'))
    .catch(() => false);
  return probe;
}

export function useCharacterAvailable(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void characterAvailable().then((v) => live && setOk(v));
    return () => {
      live = false;
    };
  }, []);
  return ok;
}

export interface CharacterProps {
  color: string;
  motion: MutableRefObject<MotionState>;
  /** Bots always use the light procedural body for performance. */
  forceProcedural?: boolean;
  backpack?: boolean;
  skin?: string;
  hair?: string;
}

/** The player's 3D character: glTF model if provided, otherwise the procedural Chibi. */
export function Character({ forceProcedural, ...props }: CharacterProps) {
  const hasGlb = useCharacterAvailable();
  if (!forceProcedural && hasGlb) {
    return (
      <Suspense fallback={<Chibi {...props} />}>
        <GltfCharacter motion={props.motion} color={props.color} />
      </Suspense>
    );
  }
  return <Chibi {...props} />;
}

function pickClip(names: string[], wanted: string[]): string | undefined {
  const lower = names.map((n) => n.toLowerCase());
  for (const w of wanted) {
    const i = lower.findIndex((n) => n.includes(w));
    if (i >= 0) return names[i];
  }
  return undefined;
}

function GltfCharacter({ motion, color }: { motion: MutableRefObject<MotionState>; color: string }) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(CHARACTER_GLB);
  const model = useMemo(() => {
    const m = cloneSkinned(scene);
    m.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    // Normalize height so any asset fits the controller capsule.
    const box = new THREE.Box3().setFromObject(m);
    const h = box.max.y - box.min.y || 1;
    m.scale.setScalar(CHARACTER_HEIGHT / h);
    m.position.y = -box.min.y * (CHARACTER_HEIGHT / h);
    return m;
  }, [scene]);
  const { actions, names } = useAnimations(animations, group);
  const clipFor = useMemo(
    () => ({
      idle: pickClip(names, CLIPS.idle),
      walk: pickClip(names, CLIPS.walk),
      run: pickClip(names, CLIPS.run),
      jump: pickClip(names, CLIPS.jump),
      cheer: pickClip(names, CLIPS.cheer),
    }),
    [names],
  );
  const current = useRef<string | undefined>(undefined);

  useFrame(() => {
    const m = motion.current;
    const want =
      (m.cheer ?? 0) > 0 && clipFor.cheer
        ? clipFor.cheer
        : m.airborne
          ? clipFor.jump ?? clipFor.idle
          : m.gait > 1.4
            ? clipFor.run ?? clipFor.walk
            : m.gait > 0.1
              ? clipFor.walk
              : clipFor.idle;
    if (want && want !== current.current) {
      const next = actions[want];
      const prev = current.current ? actions[current.current] : undefined;
      next?.reset().fadeIn(0.18).play();
      prev?.fadeOut(0.18);
      current.current = want;
    }
  });

  return (
    <group ref={group}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.38, 0.5, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} depthWrite={false} />
      </mesh>
      <primitive object={model} />
    </group>
  );
}
