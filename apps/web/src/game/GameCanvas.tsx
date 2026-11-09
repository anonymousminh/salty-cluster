import { Suspense, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { CameraControls, KeyboardControls, PerformanceMonitor, Sky } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import {
  BASE_XP,
  WORLD,
  getBoothSlot,
  getSpot,
  isBounty,
  type Availability,
  type Booth as BoothData,
  type BoothStats,
} from '@meetspace/venue';
import { KEYBOARD_MAP, Player } from './Player';
import { useGame } from './store';
import { Booth } from './world/Booth';
import { Bots } from './world/Bots';
import { Ground } from './world/Ground';
import { Beacon, GuideArrow, MeetupPoint } from './world/Markers';
import { Scenery } from './world/Scenery';
import { QUEST } from './theme';
import { useDemoStore } from './demo/store';

export interface GameCanvasProps {
  playerName: string;
  playerColor: string;
  booths: BoothData[];
  boothStats: BoothStats;
  visitedBoothIds: string[];
  availability: Record<string, Availability>;
  onTalk: (boothId: string) => void;
}

/** The 3D game world. The DOM HUD is rendered separately on top. */
export function GameCanvas(props: GameCanvasProps) {
  const [dpr, setDpr] = useState(1.5);
  return (
    <KeyboardControls map={KEYBOARD_MAP}>
      <Canvas className="game-canvas" dpr={[1, dpr]} camera={{ fov: 50, near: 0.3, far: 400, position: [30, 26, 70] }} gl={{ antialias: true, powerPreference: 'high-performance' }}>
        <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} />
        <Sky sunPosition={[80, 50, 40]} turbidity={3} rayleigh={0.6} mieCoefficient={0.004} />
        <fog attach="fog" args={['#cfe9f7', 70, 190]} />
        <hemisphereLight args={['#ffffff', '#86d97b', 1.0]} />
        <directionalLight position={[40, 60, 30]} intensity={1.4} />
        <Suspense fallback={null}>
          <Physics>
            <World {...props} />
          </Physics>
        </Suspense>
      </Canvas>
    </KeyboardControls>
  );
}

function World({ playerName, playerColor, booths, boothStats, visitedBoothIds, availability, onTalk }: GameCanvasProps) {
  const phase = useGame((s) => s.phase);
  const waypoint = useGame((s) => s.waypoint);
  const nearBoothId = useGame((s) => s.nearBoothId);
  const startDemo = useDemoStore((s) => s.startDemo);
  const visited = new Set(visitedBoothIds);
  const statsReady = Object.keys(boothStats).length > 0;

  const target =
    waypoint?.kind === 'spot'
      ? getSpot(waypoint.id)?.anchor ?? null
      : waypoint?.kind === 'booth'
        ? (() => {
            const b = booths.find((x) => x.id === waypoint.id);
            return b ? getBoothSlot(b.slotId)?.anchor ?? null : null;
          })()
        : null;

  return (
    <>
      <Ground />
      <Scenery />
      {booths.map((b) => {
        const slot = getBoothSlot(b.slotId);
        if (!slot) return null;
        const stat = boothStats[b.id];
        const state = visited.has(b.id) ? 'visited' : statsReady && isBounty(stat) ? 'bounty' : 'open';
        return (
          <group key={b.id}>
            <Booth booth={b} slot={slot} state={state} xp={BASE_XP + (stat?.bonus ?? 0)} near={b.id === nearBoothId} targeted={waypoint?.kind === 'booth' && waypoint.id === b.id} />
            {state === 'bounty' && !(waypoint?.kind === 'booth' && waypoint.id === b.id) && <Beacon at={slot.anchor} color={QUEST.bounty} height={12} radius={0.4} opacity={0.5} />}
          </group>
        );
      })}
      {WORLD.spots.map((s) => (
        <MeetupPoint key={s.id} spot={s} availability={availability[s.id]} targeted={waypoint?.kind === 'spot' && waypoint.id === s.id} />
      ))}
      <Bots />
      {target && <Beacon at={target} color={waypoint?.kind === 'spot' ? QUEST.meetup : QUEST.waypoint} />}
      {phase === 'playing' ? (
        <>
          <Player color={playerColor} name={playerName} booths={booths} onTalk={onTalk} onStartDemo={(id) => startDemo(id)} />
          <GuideArrow target={target} color={waypoint?.kind === 'spot' ? QUEST.meetup : QUEST.waypoint} />
        </>
      ) : (
        <LobbyCamera />
      )}
    </>
  );
}

/** Slow cinematic orbit over the park while attendees are in the lobby. */
function LobbyCamera() {
  const ref = useRef<CameraControls>(null);
  const started = useRef(false);
  useFrame((_, delta) => {
    const c = ref.current;
    if (!c) return;
    if (!started.current) {
      void c.setLookAt(34, 30, 62, 0, 0, 8, false);
      started.current = true;
    }
    void c.rotate(delta * 0.05, 0, false);
  });
  return <CameraControls ref={ref} makeDefault enabled={false} />;
}
