import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { seededRandom, type Vec2 } from '@meetspace/venue';
import { Chibi, type MotionState } from '../character/Chibi';
import { NameTag } from './NameTag';

/**
 * Simulated attendees for the demo. They walk loops along the park paths and pause at
 * booths. Real multiplayer would replace this with positions from a presence channel
 * (~10 Hz over WebSocket) interpolated the same way.
 */

type Leg = { at: Vec2; pause?: number };

const LOOPS: Leg[][] = [
  // Expo browse: up the street, stopping at booths on both sides.
  [{ at: [-4, 36] }, { at: [-4, 25] }, { at: [-1.5, 21] }, { at: [-5.5, 18], pause: 4 }, { at: [5.5, 11], pause: 3 }, { at: [-5.5, -5], pause: 4 }, { at: [5.5, -12], pause: 3 }, { at: [-5.5, -19], pause: 4 }, { at: [0, -24] }, { at: [1.5, 2] }, { at: [4, 25] }, { at: [4, 36] }],
  // Garden loop.
  [{ at: [-4, 34] }, { at: [-4, 25] }, { at: [-1, 2] }, { at: [-29.5, 2] }, { at: [-29.5, -15], pause: 3 }, { at: [-29.5, 20], pause: 3 }, { at: [-29.5, 2] }, { at: [1, 2] }, { at: [4, 25] }, { at: [4, 34] }],
  // Careers loop.
  [{ at: [4, 34] }, { at: [4, 25] }, { at: [1, 2] }, { at: [32, 2] }, { at: [32, -12], pause: 3 }, { at: [29.5, -4], pause: 4 }, { at: [34.5, 10], pause: 4 }, { at: [32, 2] }, { at: [-1, 2] }, { at: [-4, 25] }, { at: [-4, 34] }],
  // Keynote.
  [{ at: [4, 36] }, { at: [4, 25] }, { at: [0, 20] }, { at: [0, -26] }, { at: [-2.5, -27], pause: 6 }, { at: [2.5, -27], pause: 5 }, { at: [0, -20] }, { at: [-4, 25] }, { at: [-4, 36] }],
];

const NAMES = ['Priya', 'Marcus', 'Elena', 'Jun', 'Sofia', 'Diego', 'Aisha', 'Tom', 'Mei', 'Omar', 'Hana', 'Lucas'];
const COLORS = ['#f472b6', '#22d3ee', '#a78bfa', '#facc15', '#34d399', '#fb923c', '#60a5fa', '#f87171'];
const HAIR = ['#3b2a20', '#111827', '#a16207', '#7c2d12', '#e5e7eb'];
const SKIN = ['#ffd7b5', '#f1c27d', '#c68642', '#8d5524', '#ffe0bd'];

interface BotSpec {
  name: string;
  color: string;
  hair: string;
  skin: string;
  loop: Leg[];
  lane: number;
  speed: number;
  startDist: number;
}

export function Bots({ count = 12 }: { count?: number }) {
  const specs = useMemo<BotSpec[]>(() => {
    const rnd = seededRandom(7);
    return Array.from({ length: count }, (_, i) => ({
      name: NAMES[i % NAMES.length]!,
      color: COLORS[i % COLORS.length]!,
      hair: HAIR[i % HAIR.length]!,
      skin: SKIN[(i * 3) % SKIN.length]!,
      loop: LOOPS[i % LOOPS.length]!,
      lane: (rnd() - 0.5) * 2,
      speed: 1.1 + rnd() * 0.6,
      startDist: rnd() * 120,
    }));
  }, [count]);
  return (
    <group>
      {specs.map((s, i) => (
        <Bot key={i} spec={s} />
      ))}
    </group>
  );
}

function Bot({ spec }: { spec: BotSpec }) {
  const group = useRef<THREE.Group>(null);
  const motion = useRef<MotionState>({ gait: 0, airborne: false });
  const legs = useMemo(() => {
    const out: { from: Vec2; to: Vec2; len: number; pause: number }[] = [];
    for (let i = 0; i < spec.loop.length; i++) {
      const a = spec.loop[i]!;
      const b = spec.loop[(i + 1) % spec.loop.length]!;
      out.push({ from: a.at, to: b.at, len: Math.hypot(b.at[0] - a.at[0], b.at[1] - a.at[1]), pause: b.pause ?? 0 });
    }
    return out;
  }, [spec.loop]);
  const state = useRef({ leg: 0, along: 0, paused: 0, heading: 0 });
  // Start somewhere along the loop.
  useMemo(() => {
    let d = spec.startDist % legs.reduce((s, l) => s + l.len, 0);
    let i = 0;
    while (d > legs[i]!.len) {
      d -= legs[i]!.len;
      i = (i + 1) % legs.length;
    }
    state.current.leg = i;
    state.current.along = d;
  }, [legs, spec.startDist]);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const st = state.current;
    const dt = Math.min(delta, 0.1);
    if (st.paused > 0) {
      st.paused -= dt;
      motion.current.gait = 0;
    } else {
      st.along += spec.speed * dt;
      const leg = legs[st.leg]!;
      if (st.along >= leg.len) {
        st.along -= leg.len;
        st.paused = leg.pause;
        if (leg.pause > 0) motion.current.cheer = Math.random() < 0.3 ? 1.2 : 0;
        st.leg = (st.leg + 1) % legs.length;
      }
      motion.current.gait = spec.speed / 1.4;
    }
    const leg = legs[st.leg]!;
    const t = leg.len > 0 ? st.along / leg.len : 0;
    const dx = leg.to[0] - leg.from[0];
    const dz = leg.to[1] - leg.from[1];
    const len = leg.len || 1;
    // Lateral lane offset so bots don't walk in single file.
    const nx = -dz / len;
    const nz = dx / len;
    g.position.set(leg.from[0] + dx * t + nx * spec.lane, 0, leg.from[1] + dz * t + nz * spec.lane);
    const target = Math.atan2(dx, dz); // model faces +z
    let diff = target - st.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    st.heading += diff * Math.min(1, dt * 8);
    g.rotation.y = st.heading;
  });

  return (
    <group ref={group}>
      <Chibi color={spec.color} motion={motion} hair={spec.hair} skin={spec.skin} />
      <NameTag text={spec.name} y={2.05} height={0.26} />
    </group>
  );
}
