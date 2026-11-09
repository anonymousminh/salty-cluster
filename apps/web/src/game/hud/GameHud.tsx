import { useEffect, useMemo, useState } from 'react';
import { Joystick, VirtualButton } from 'ecctrl/input';
import {
  BASE_XP,
  WALK_SPEED_MPS,
  getBoothSlot,
  getSpot,
  isBounty,
  type Booth,
  type BoothStats,
  type CareerProfile,
  type Leaderboard,
  type Progress,
  type QuestEvent,
  type Vec2,
} from '@meetspace/venue';
import { useGame } from '../store';
import { BoothDialog } from './BoothDialog';
import { CompassBar, type CompassMarker } from './CompassBar';
import { Minimap } from './Minimap';
import { LeaderboardPanel, Toasts, XpBar } from './Panels';
import './hud.css';
import { useDemoStore } from '../demo/store';
import { getDemoExperience } from '../../data/demoBooths';

export interface GameHudProps {
  booths: Booth[];
  boothStats: BoothStats;
  progress?: Progress;
  leaderboard?: Leaderboard;
  events: QuestEvent[];
  careerProfile?: CareerProfile;
  onCheckIn: (boothId: string) => void;
}

/** Everything drawn over the 3D world while playing. */
export function GameHud({ booths, boothStats, progress, leaderboard, events, careerProfile, onCheckIn }: GameHudProps) {
  const pos = useGame((s) => s.playerPos);
  const waypoint = useGame((s) => s.waypoint);
  const nearBoothId = useGame((s) => s.nearBoothId);
  const openBoothId = useGame((s) => s.openBoothId);
  const arrivedSpotId = useGame((s) => s.arrivedSpotId);
  const openBooth = useGame((s) => s.openBooth);
  const setWaypoint = useGame((s) => s.setWaypoint);
  const startDemo = useDemoStore((s) => s.startDemo);
  const isBoothVisited = useDemoStore((s) => s.isBoothVisited);
  const isBoothCompleted = useDemoStore((s) => s.isBoothCompleted);
  const demoStats = useDemoStore((s) => s.stats);
  const touch = useIsTouch();
  const visited = useMemo(() => new Set(progress?.visitedBoothIds ?? []), [progress]);

  const target = resolveTarget(waypoint, booths);
  const nearBooth = nearBoothId ? booths.find((b) => b.id === nearBoothId) : undefined;
  const open = openBoothId ? booths.find((b) => b.id === openBoothId) : undefined;

  // Compass: waypoint + up to 3 nearest unvisited bounty booths.
  const markers: CompassMarker[] = [];
  if (target) markers.push({ id: 'wp', at: target.at, kind: 'waypoint', label: target.name });
  booths
    .filter((b) => !visited.has(b.id) && isBounty(boothStats[b.id]) && b.id !== waypoint?.id)
    .map((b) => ({ b, at: getBoothSlot(b.slotId)?.anchor }))
    .filter((x): x is { b: Booth; at: Vec2 } => !!x.at)
    .sort((a, b) => dist(a.at, pos) - dist(b.at, pos))
    .slice(0, 3)
    .forEach(({ b, at }) => markers.push({ id: b.id, at, kind: 'bounty', label: b.company }));

  const d = target ? dist(target.at, pos) : 0;
  const distanceLabel = target ? `${Math.round(d)} m · ${Math.max(1, Math.round(d / WALK_SPEED_MPS / 60))} min` : undefined;

  return (
    <div className="hud">
      <CompassBar you={pos} markers={markers} distanceLabel={distanceLabel} />
      {target && (
        <div className="hud-objective">
          <span className="hud-objective__k">{target.kind === 'spot' ? 'MEETUP' : 'WAYPOINT'}</span>
          <span className="hud-objective__v">{target.name}</span>
          <button className="hud-objective__x" onClick={() => setWaypoint(null)} aria-label="Clear waypoint">
            ×
          </button>
        </div>
      )}
      <Minimap booths={booths} boothStats={boothStats} visited={visited} target={target?.at ?? null} />
      <LeaderboardPanel leaderboard={leaderboard} />
      <Toasts events={events} />

      {arrivedSpotId && waypoint?.kind === 'spot' && waypoint.id === arrivedSpotId && (
        <div className="hud-arrived">📍 You made it to {getSpot(arrivedSpotId)?.name}! Your match is on the way.</div>
      )}

      {nearBooth && !open && (() => {
        const demoExp = getDemoExperience(nearBooth.id);
        const visited = isBoothVisited(nearBooth.id);
        const completed = isBoothCompleted(nearBooth.id);
        if (demoExp) {
          return (
            <button className="hud-prompt" onClick={() => startDemo(nearBooth.id)}>
              <kbd>{touch ? 'TAP' : 'E'}</kbd> {completed ? 'Replay' : visited ? 'Continue'} Demo: <b>{nearBooth.company}</b>
              {!completed && <span className="xp">+110 XP</span>}
              {completed && <span className="xp">✓ Completed</span>}
            </button>
          );
        }
        return (
          <button className="hud-prompt" onClick={() => openBooth(nearBooth.id)}>
            <kbd>{touch ? 'TAP' : 'E'}</kbd> Talk to <b>{nearBooth.company}</b>
            {!visited.has(nearBooth.id) && <span className="xp">+{BASE_XP + (boothStats[nearBooth.id]?.bonus ?? 0)} XP</span>}
          </button>
        );
      })()}

      {open && (
        <BoothDialog
          booth={open}
          allBooths={booths}
          stat={boothStats[open.id]}
          visited={visited.has(open.id)}
          profile={careerProfile}
          onCheckIn={(id) => {
            onCheckIn(id);
          }}
          onClose={() => openBooth(null)}
        />
      )}

      <XpBar progress={progress} />
      {!touch && <ControlsHelp />}
      {touch && !open && (
        <div className="hud-touch">
          <Joystick joystickWrapperStyle={{ position: 'absolute', left: 12, bottom: 70, width: 160, height: 160 }} />
          <div className="hud-touch__buttons">
            <VirtualButton id="jump" label="Jump" />
            <VirtualButton id="talk" label="Talk" />
          </div>
        </div>
      )}
    </div>
  );
}

function ControlsHelp() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setShow(false), 12000);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <button className={`hud-help${show ? '' : ' mini'}`} onClick={() => setShow((s) => !s)} title="Controls">
      {show ? (
        <>
          <span><kbd>W A S D</kbd> move</span>
          <span><kbd>Shift</kbd> run</span>
          <span><kbd>Space</kbd> jump</span>
          <span><kbd>E</kbd> talk</span>
          <span><kbd>drag</kbd> look · <kbd>wheel</kbd> zoom</span>
        </>
      ) : (
        <kbd>?</kbd>
      )}
    </button>
  );
}

function useIsTouch(): boolean {
  const [t] = useState(() => typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || new URLSearchParams(window.location.search).has('touch')));
  return t;
}

export interface ResolvedTarget {
  kind: 'spot' | 'booth';
  name: string;
  at: Vec2;
}

export function resolveTarget(wp: { kind: 'spot' | 'booth'; id: string } | null, booths: Booth[]): ResolvedTarget | null {
  if (!wp) return null;
  if (wp.kind === 'spot') {
    const s = getSpot(wp.id);
    return s ? { kind: 'spot', name: s.name, at: s.anchor } : null;
  }
  const b = booths.find((x) => x.id === wp.id);
  const slot = b && getBoothSlot(b.slotId);
  return b && slot ? { kind: 'booth', name: b.company, at: slot.anchor } : null;
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
