import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Chibi, type MotionState } from '../character/Chibi';
import { remotes } from '../net/remotes';
import { useNet } from '../net/store';
import { ChatBubble } from './ChatBubble';
import { NameTag } from './NameTag';

const DEG = Math.PI / 180;

/** Real players near you (from the server's snapshots). Offline, or alone in the park, this renders nothing. */
export function RemotePlayers() {
  const visible = useNet((s) => s.visible);
  return (
    <group>
      {visible.map((pid) => (
        <RemoteAvatar key={pid} pid={pid} />
      ))}
    </group>
  );
}

function RemoteAvatar({ pid }: { pid: string }) {
  const ref = useNet((s) => s.roster[pid]);
  const group = useRef<THREE.Group>(null);
  const motion = useRef<MotionState>({ gait: 0, airborne: false });
  const smooth = useRef({ init: false, x: 0, z: 0, yaw: 0 });

  useFrame((_, delta) => {
    const g = group.current;
    const r = remotes.get(pid);
    if (!g || !r) return;
    const s = smooth.current;
    const dt = Math.min(delta, 0.1);
    if (!s.init || Math.hypot(r.x - s.x, r.z - s.z) > 12) {
      // First sighting, or a teleport: appear in place instead of sliding across the park.
      s.x = r.x;
      s.z = r.z;
      s.yaw = Math.PI / 2 - r.h * DEG;
      s.init = true;
    }
    // Snapshots arrive ~5 times a second: ease towards the latest one (about 0.1 s behind).
    const k = 1 - Math.exp(-dt * 11);
    s.x += (r.x - s.x) * k;
    s.z += (r.z - s.z) * k;
    const targetYaw = Math.PI / 2 - r.h * DEG; // model faces +z; plan heading 0° is +x
    let d = targetYaw - s.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    s.yaw += d * Math.min(1, dt * 10);
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.yaw;
    motion.current.airborne = r.m === 3;
    motion.current.gait = r.m === 2 ? 2 : r.m === 1 || r.m === 3 ? 1 : 0;
  });

  if (!ref) return null;
  return (
    <group ref={group}>
      <Chibi color={ref.color} motion={motion} />
      <NameTag text={ref.name} y={2.05} height={0.26} />
      {/* Bubbles stay upright: they are sprites, so only the position follows the avatar. */}
      <ChatBubble pid={pid} y={2.3} />
    </group>
  );
}
